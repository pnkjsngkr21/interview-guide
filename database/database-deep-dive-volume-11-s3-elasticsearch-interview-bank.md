---
title: "The Database Complete Deep-Dive"
volume: 11
series: "S3, ELASTICSEARCH & THE INTERVIEW BANK"
subtitle: "Study & Interview Mastery Guide"
---

# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is an eleven-volume study guide to databases, written for engineers who already know
how to build a backend service and are preparing for senior and staff-level interviews. It
is not a tutorial. Nothing here explains what a table is.

The organising question of every chapter is the same one a staff engineer gets asked in a
real design review: **not "what does this do", but "why would a team choose this, what does
it cost, when does it break, and how expensive is it to undo?"** A database's annotations —
`B+ tree`, `MVCC`, `primary key`, `eventual consistency` — are treated as the visible
surface of a storage engine, a concurrency protocol, and a durability model, and the notes
always go down to that machinery, because that is the layer where production incidents
actually live. The `EXPLAIN` output is not a black box to be pasted into a ticket; it is the
optimiser telling you what it believes about your data, and the gap between that belief and
reality is the bug.

Volume 11 is the last volume, and it does two different jobs. Chapters 1 to 5 are about
**S3**, which is the one store in the entire set that deliberately throws away almost
everything the other ten volumes built up — no updates, no secondary indexes, no query
planner, no transactions, and a completely flat namespace. That is not a simplification S3
failed to notice; it is the design that lets a single endpoint serve a hundred trillion
objects, and being able to explain *why* it survives without any of the machinery is the
point. Chapters 6 to 8 are about **Elasticsearch**, which is the opposite failure mode in
one specific way: it is a search engine that grew a storage layer, and almost every incident
in it comes from a document model that was never actually designed. Chapter 9 puts all
eight stores in one table. Chapter 10 is the consolidated interview bank for the whole set.

The staff-level theme running through the volume is **the cost of a decision that hides
behind an API**. S3's `ListObjectsV2` looks like a query. Elasticsearch's `search` looks
like a database. Both are billed and both are limited in ways that only become visible when
you go to production with them, and the engineers who get hurt are the ones who never
looked. Every chapter here goes to the actual limit — the 1,000-key page, the 1-second
refresh, the 30-day minimum storage duration, the `TEXT`/`KEYWORD` field, the 10,000-hit
`from`/`size` ceiling — because the limit is the design, and a design you cannot state is a
design you cannot defend.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto the relational
algebra produces filler. The template is a completeness checklist, not a template to fill.

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

One note specific to this volume: the per-volume banks in Volumes 1 to 10 are the
*drill* — they are weighted toward that volume's traps, and the right way to use them is
one at a time, cold, immediately after finishing the matching chapter. **This volume's
bank is deliberately the consolidated one.** Chapter 10 is organised by category rather
than by volume, so a candidate revising in one sitting can land on a topic cold, without
having to remember which of the ten volumes owns it. The `D` questions run continuously
across the whole bank and are weighted heaviest, because design trade-offs are what a
staff interview is actually testing and what a per-volume drill cannot rehearse.

### Continuing From Volume 10

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
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 (this book) | S3, Elasticsearch & the Database Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 11

- Chapter 1 — S3: The Object Model
- Chapter 2 — S3: Durability, Consistency & Availability
- Chapter 3 — S3: Storage Classes, Lifecycle & Cost
- Chapter 4 — S3: Access Control, Presigned URLs & Multipart
- Chapter 5 — S3: Anti-Patterns
- Chapter 6 — Elasticsearch: The Inverted Index
- Chapter 7 — Elasticsearch: Mapping, Analyzers & Relevance
- Chapter 8 — Elasticsearch: Shards, Replicas & Operations
- Chapter 9 — Putting It Together — Choosing a Store
- Chapter 10 — The Database & SQL Interview Bank
- Chapter 11 — End of the Set — Where to Go Next

---

# Part 1 — S3, Elasticsearch & the Interview Bank

## Chapter 1 — S3: The Object Model

### 1.1 The Answer Everybody Gives, and Why It Is Wrong

Every interview answer starts here: *"S3 is object storage — you put files in buckets with
folders, and you get them back over HTTP."* Three words in that sentence are wrong, and
each one is wrong in a way that produces a real bug rather than just an imprecise phrase.

The first is **folders**. S3 has no folders. It has no directories, no sub-buckets, and no
hierarchy of any kind. What the console draws as a folder is a client-side rendering
computed from the `/` characters in your key names, and the moment you look at the raw API
the structure is gone. The second is **files** — an object is an opaque byte sequence plus
metadata; S3 does not know what a file is, does not open it, and will happily store an
executable, a partial record, or a zero-byte placeholder. The third is **over HTTP**,
which understates the point: S3 is a key-value store with an HTTP interface, and the moment
your application starts treating the HTTP as a bonus rather than as the *only* structure
is the moment it starts building a query engine on top of a flat map.

The decomposition that gets the marks:

```text
  S3 IS EXACTLY FOUR THINGS
  ─────────────────────────
  1. A BUCKET      — a named container, globally unique, in one Region,
                      the unit of policy, billing and lifecycle
  2. A KEY         — an opaque UTF-8 string, ≤ 1024 bytes, the unique
                      identifier within the bucket
  3. A VALUE       — an opaque byte sequence, 0 B to 5 TB
  4. METADATA      — size, ETag, content-type, storage class, encryption,
                      user-defined x-amz-meta-*, tags, version id

  WHAT IT IS NOT
  ──────────────
  ✗ a filesystem        ✗ a database        ✗ a queue
  ✗ a namespace tree    ✗ a transactional store
```

> **INTERVIEW TRAP — "S3 HAS FOLDERS"**
>
> This is the single most common false fact in the S3 chapter, and it is worse than a
> vague answer because it produces a specific design error. If S3 had folders, then
> deleting a folder would be an operation, and prefix permissions would be scoped to a
> tree. Neither is true. The picture is:
>
> ```text
>   What the console shows          What the API actually holds
>   ──────────────────────          ─────────────────────────
>   my-bucket/                       my-bucket/
>   ├── invoices/                    ├── "invoices/2026-01/inv_1.pdf"
>   │   ├── 2026-01/                ├── "invoices/2026-01/inv_2.pdf"
>   │   │   ├── inv_1.pdf            ├── "invoices/2026-02/inv_3.pdf"
>   │   │   └── inv_2.pdf            └── "assets/logo.png"
>   │   └── 2026-02/
>   │       └── inv_3.pdf
>   └── assets/
>       └── logo.png
>
>   Four objects. Zero folders.     Six keys, four of which happen to
>   The "invoices" folder is a      contain the character '/'.
>   client-side group-by.
> ```
>
> Three consequences fall directly out, and all three are real incidents. (1) You cannot
> atomically delete a folder. A lifecycle rule can expire everything under a prefix, but
> that is a filter over a `LIST`, not a `DELETE` of a node, so a concurrent write into the
> prefix can survive. (2) A "folder" and a key can collide: the object literally named
> `invoices` and the object named `invoices/2026-01/inv_1.pdf` coexist without any conflict,
> because one starts with the other and there is no tree to contradict. (3) The console
> creates a real zero-byte object with key `invoices/` when you click "create folder", which
> is why a listing that "should" be empty is not.
>
> The senior sentence: **"S3 is a flat map from a string to a byte array, and the only
> structure it has is that the strings happen to sort lexicographically."**

### 1.2 Keys, Prefixes, and the Only Structure There Is

A key is a sequence of Unicode characters encoded in UTF-8, at most 1,024 bytes. That 1,024
includes every prefix, every delimiter, and the filename — `Development/Projects.xls` is one
key of 24 bytes, not a 16-byte name inside an 8-byte folder. Keys are **case sensitive**,
and S3 sorts them lexicographically by their UTF-8 byte values, which means the sort order
is punctuation first, then uppercase, then lowercase, then everything non-ASCII:

```text
  SORT ORDER IS BY BYTE VALUE, NOT BY HUMAN LOGIC
  ──────────────────────────────────────────────────
  "Apple/"     0x41 'A'      ─┐
  "apple/"     0x61 'a'       │  uppercase before lowercase
  "éclair/"    0xC3 0xA9      │  multi-byte UTF-8 sorts after ASCII
  "中文/"       0xE4 0xB8 0xAD  ─┘
  "!/x"        0x21 '!'      ── special characters sort FIRST
```

That byte-value ordering is not an implementation detail — it is the entire basis on which
prefix listing works. A `LIST` with `prefix=invoices/2026-01/` returns the keys that begin
with those bytes, and it can do that efficiently **because all keys sharing a prefix are
contiguous in the sorted order.** No index beyond the sort is needed; the range is a range.

```text
  WHY PREFIX LISTING IS EFFICIENT — AND WHAT IT BUYS

  the sorted keyspace (all keys, byte order, one flat line)
  ─────────────────────────────────────────────────────────
  ... assets/logo.png │ a/b/c.txt │ invoices/2026-01/inv_1.pdf │
  │  invoices/2026-01/inv_2.pdf │ invoices/2026-02/inv_3.pdf  │ ...
  │            ▲
  │            └── prefix=invoices/2026-01/ is ONE CONTIGUOUS RANGE.
  │                No directory index, no B+ tree, no traversal state.
  │                The "directory" is a range query over a sort order.

  BUT — and this is the whole cost model —
  • a request costs money (LIST is billed per 1,000 keys returned)
  • a response returns at most 1,000 keys, then you need a CONTINUATION TOKEN
  • so listing a 10,000,000-object prefix is 10,000 sequential round trips
```

That last bullet is the seed of Chapter 5. Prefix listing is efficient *per request* and
catastrophic *in aggregate*, and the difference between those two statements is the entire
reason `LIST` is not a query engine.

> **MUST REMEMBER**
>
> The `/` in a key is a character, not a separator. S3 does not parse it, does not treat it
> as special, and does not require it — `a/b.txt` and `ab.txt` are two unrelated keys, and
> `a//b.txt` is a third perfectly valid one. The only thing a delimiter does is tell a
> `LIST` request to stop and report a "common prefix" as though it were a directory, which
> is a *rendering* of the answer, not a change to the data.

### 1.3 Object Metadata, ETags, and Why Your MD5 Check Was Lying

An object is bytes plus metadata, and the metadata is doing more work than most engineers
assume. Three fields cause real problems.

**`ETag`** is documented as "an entity tag that represents a specific version of an object".
For a single-part upload of unencrypted data, or SSE-S3 encrypted data, it is the MD5 of
the object body — which is why every engineer writes a client-side MD5, compares it to the
ETag, and concludes their upload is verified. That conclusion holds exactly in that case.
It fails in three others:

```text
  WHEN IS THE ETag AN MD5 OF THE BODY?
  ────────────────────────────────
  ✓ single-part PUT, unencrypted or SSE-S3   → yes, compare it
  ✗ multipart upload                         → no. It is a checksum of checksums,
                                               suffixed "-<partcount>":
                                               "d41d8cd98f00b204e9800998ecf8427e-17"
  ✗ SSE-KMS / SSE-C encrypted                → no, the key affects the ETag
  ✗ an object that was COPIED                 → no. CopyObject recomputes it from
                                               the parts of the source object.

  THE RIGHT TOOL
  ─────────────
  S3 now stores a real checksum per object and supports several algorithms. The default
  for uploads that do not specify one is CRC-64/NVME, exposed as
  "x-amz-checksum-crc64nvme". For multipart with checksums you may use a COMPOSITE
  checksum (per-part, combined) or a FULL-OBJECT checksum (computed on completion);
  full-object checksums require consecutive part numbers starting at 1, and a
  non-consecutive complete request is rejected with an HTTP 500.
```

**`Last-Modified`** on a multipart object is the date the multipart upload was *initiated*,
not the date the object was completed. Two teams have shipped logic that reads
`Last-Modified` to decide which copy of a file is newer, and both were wrong for
multipart uploads, because a long upload reports a timestamp hours before the object
actually became readable.

**User-defined metadata** (`x-amz-meta-*`) cannot be modified in place. There is no
"update metadata" call. Changing it means `CopyObject` onto itself with new metadata — a
full server-side rewrite that creates a new version in a versioned bucket and changes the
ETag. The limits are also smaller than people assume: the `PUT` request header is capped at
8 kB, of which user-defined metadata is capped at 2 kB, and there are separate 2 kB caps
on system metadata and on object tags (10 tags max). And metadata is not a free annotation
area — it is part of the object, so the same storage and lifecycle rules apply.

### 1.4 Versioning: Delete Markers and the Thing That Confuses Everyone

Enabling versioning on a bucket changes what `PUT` and `DELETE` mean, and almost nobody
picks it up from the API reference.

- A `PUT` creates a new version with a new version id. The old version is retained.
- A `DELETE` on a versioned bucket does **not** delete data. It writes a **delete marker** —
  a zero-byte object with the key, a new version id, and `x-amz-delete-marker: true`.
- A `GET` on a key whose current version is a delete marker returns `404 NoSuchKey`,
  which looks identical to the key never having existed.
- To actually remove data you must delete *specific version ids*, or add a lifecycle rule
  that expires noncurrent versions.

```text
  KEY: report.csv        (versioning enabled 2026-01-01)

   time   operation                  versions now                     GET returns
  ─────   ─────────────────────────  ───────────────────────────────  ───────────
  t0      PUT v=A                     [A]                               A
  t1      PUT v=B                     [A, B]                            B
  t2      DELETE  (no version id)     [A, B, ✗MARKER]                  404
  t3      PUT v=C                     [A, B, ✗MARKER, C]               C
  t4      DELETE  (no version id)     [A, B, ✗MARKER, C, ✗MARKER]      404

  Data size at t4: A + B + C are all still there. Two zero-byte markers.
  "The bucket is empty" and "the bucket costs the same as it did in January"
  are both true at the same time.
```

> **PRODUCTION SCENARIO**
>
> Problem: a team enabled versioning during a compliance project, then a support workflow
> ran `DELETE` on a customer's uploaded ID documents. The UI showed the file gone and the
> customer was told it was removed. The compliance answer was that the data was still
> present and still retrievable.
> Investigation: storage byte count for the bucket never dropped after the delete wave, and
> `aws s3api list-object-versions` showed a delete-marker version per deleted key.
> Root cause: `DELETE` without a version id on a versioned bucket writes a marker rather
> than removing bytes, and no one on the team knew the semantics had changed when they
> turned the feature on. The control that was supposed to guarantee deletion guaranteed
> its opposite.
> Solution: the deletion workflow was changed to enumerate current version ids and delete
> them explicitly, and a lifecycle rule was added to expire noncurrent versions after a
> retention window agreed with legal.
> Prevention: enabling a bucket-level feature that silently changes the meaning of an
> existing call is a migration, not a checkbox. It belongs in a runbook with a rollback and
> a test against a production-shaped copy of the bucket.

### 1.5 Why This Design Scales, and What It Costs

Every one of S3's limitations follows from one decision: **the object is immutable and
addressed by an exact key.** There is no in-place update, because update is a `PUT` that
creates a whole new object. There is no secondary index, because there is no query to index.
There is no transaction, because there is nothing to make atomic across. There is no
transactional update, because there is no read-modify-write the service can perform for you.

```text
  REMOVE A MECHANISM          AND THIS GETS EASIER
  ───────────────────        ──────────────────────────────
  no UPDATE in place    →    no page locks, no MVCC, no write amplification.
                             A PUT is an append to a new object. Concurrency
                             control becomes "last writer wins", which is free.

  no SECONDARY INDEX    →    no index maintenance on write, no index bloat,
                             no B+ tree split, no page cache pressure.
                             Write cost is O(bytes), not O(bytes + index work).

  no TRANSACTIONS       →    no lock manager, no deadlock detection, no 2PC,
                             no group commit complexity, no coordinator.
                             The service has no state that can be inconsistent.

  no QUERY PLANNER      →    the service never has to guess anything about your
                             data, so there is no statistics to go stale and no
                             plan to regress.
```

That is a real and defensible engineering position, and the reason S3 stores a
non-trivial fraction of the internet is precisely that this list adds up. The senior
framing is: **S3 did not decide that indexes and transactions were unnecessary. It decided
that a store whose access pattern is "fetch this exact thing" does not pay for them, and
it was right for its access pattern.** The moment your access pattern is not a point lookup,
you are no longer using S3 — you are paying for a key-value store while doing the indexing,
scanning and coordinating work yourself in the client.

> **TRADE-OFF — "SHOULD WE PUT THE DATABASE IN S3?"**
>
> The condition that makes it a good idea is: **the objects are large, immutable,
> write-once, and read by exact key or by a well-known prefix** — media, backups, data-lake
> partitions, model artefacts, audit logs written once and read by retention policy. Under
> those conditions S3 is cheaper per byte, more durable, and available on a scale nothing
> else matches, and you give up nothing you were using.
>
> The condition that kills it is a *query*. S3's only enumeration is `LIST` over a
> lexicographic prefix, at 1,000 keys per request and a per-1,000-keys charge, with a
> hard ceiling on how much of a prefix you should ever scan. The moment someone asks
> "give me all invoices for this customer", S3 cannot answer, and what you have actually
> built is a full table scan in which the scan is billed, network-bound, and stateless.
> That is the subject of Chapter 5.

#### Common Mistakes

- Saying S3 has folders, sub-folders, or a directory tree, and then reasoning about folder-level permissions or folder deletion
- Believing a `DELETE` on a versioned bucket removes data — it writes a delete marker
- Comparing a client-side MD5 to the `ETag` on a multipart or KMS-encrypted upload and
  concluding the upload is corrupt when it is fine
- Treating object metadata as a mutable side-channel — changing it requires a full
  `CopyObject` rewrite
- Assuming keys are case-insensitive or that S3 normalises `/` or `.` in them — it does
  none of those, and `videos/2014/../../video1.wmv` is validated by a specific
  relative-path rule rather than normalised away
- Quoting "S3 is eventually consistent" as a blanket statement — see Chapter 2, which is
  where that answer now gets caught

#### Interview Questions — The Object Model

**Q1. Describe S3's data model. Is it a filesystem?** `TRICKY`

A flat map from a string to a byte array, plus metadata. You have buckets, which are
named containers that are globally unique, live in one Region, and are the unit of policy,
billing and lifecycle. Inside a bucket, every object has exactly one key — an opaque UTF-8
string of at most 1,024 bytes, including any prefix and delimiters you typed into it — and
a value of 0 bytes to 5 TB. There is no hierarchy: the "folders" the console draws are
grouped client-side from the `/` characters in keys, and a prefix listing works only
because all keys sharing a prefix are contiguous in the byte-value sort order, which makes
a prefix a range rather than a traversal. Updates are not supported; a `PUT` replaces the
object wholesale, and there is no read-modify-write, no secondary index, no transaction,
and no query planner, because all of those exist to serve access patterns that are not
"fetch this exact key".

**Q2. Why is prefix-based listing efficient, and when does it stop being?** `ADVANCED`

Because the keyspace is sorted lexicographically by UTF-8 byte value, so every key
beginning with `invoices/2026-01/` occupies one contiguous range in that sort order. A
prefix listing is therefore a range over a sorted sequence, not a directory traversal, and
S3 can serve the first page without walking a tree. It stops being efficient at the second
scale: a `ListObjectsV2` response carries at most 1,000 keys and you continue with an
opaque continuation token, so enumerating a prefix with N objects takes roughly `N/1000`
sequential round trips, each of which is billed as a `LIST` request per 1,000 keys
returned. On a 10-million-object prefix that is about 10,000 requests and a scan whose
latency is dominated by round trips, not by the data. The efficiency is per-request; the
aggregate cost is quadratic in the number of pages you walk.

**Q3. A teammate says "I deleted the customer's file, but the S3 console still shows the
storage going up." What is the most likely explanation?** `TRICKY`

Versioning. On a versioned bucket, `DELETE` without a version id does not remove any bytes —
it writes a zero-byte delete marker, and the previous versions remain. `GET` on the key now
returns `404`, so every application-level check says the file is gone while the bucket's
stored bytes are unchanged. The other candidate is an in-progress multipart upload, whose
accumulated parts are billed until the upload is completed or explicitly aborted. The way
to tell them apart is `list-object-versions`: delete markers show up as versions, in-progress
uploads do not.

**Q4. Your team's ETag-versus-MD5 integrity check is failing on some uploads. What is
happening?** `ADVANCED`

The ETag is not always an MD5 of the object body. It is the MD5 only for a single-part
upload of unencrypted data, or data encrypted with SSE-S3. For a multipart upload it is a
checksum of the per-part checksums with a `-<partcount>` suffix, and for SSE-KMS or SSE-C
encrypted objects the key participates, so neither matches a body-side MD5. An object
produced by `CopyObject` also has an ETag computed from the copy source's parts. The right
fix is to stop comparing against the ETag and use the dedicated checksum: S3 stores a
per-object checksum and supports CRC-64/NVME, CRC-32, CRC-32C, SHA-1, SHA-256 and others,
with CRC-64/NVME applied automatically when an upload specifies no algorithm. For
multipart uploads with checksums, a full-object checksum requires consecutive part numbers
starting at 1.

**Q5. Why does S3 not have secondary indexes?** `STAFF`

Because an index is worth its write cost only when it serves a query, and S3 has no query
layer to serve. Adding a secondary index to a key-value store means every `PUT` must
update every index entry, which turns a linear append into a multi-structure write with
its own concurrency control, its own failure mode (an object committed and an index entry
lost), and its own recovery path. Since S3's contract is "fetch this exact key", none of
that maintenance buys anything. The same reasoning removes `UPDATE`, transactions and the
planner. The point worth making in a design review is that this is not a limitation being
tolerated — it is the design, and it is why a single S3 endpoint serves a hundred trillion
objects. The moment you need an index, you have changed the access pattern, and the honest
recommendation is a store built for it rather than an index bolted onto one that is not.

**Q6. Two objects are named `reports` and `reports/2026-q1.pdf`. Is that legal, and does one
shadow the other?** `TRICKY`

Perfectly legal, and neither shadows the other. There is no tree, so there is no node to
occupy or be occupied — a key is a key, and one key being a string prefix of another
carries no meaning beyond the fact that a `LIST` with `prefix=reports` returns both. This is
precisely why the console's "create folder" writes a real zero-byte object whose key is
`reports/`, and why you sometimes see a key like `reports/` in a listing where no user ever
created one. The practical advice is to reserve a delimiter convention and never create an
object whose key equals a prefix you also use as a grouping root.

#### Further Reading

- [Amazon S3 — What is Amazon S3?](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html) — the canonical description of buckets, keys, objects, versioning and the consistency model.
- [Amazon S3 — Naming Amazon S3 objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html) — the 1,024-byte limit, the flat-structure statement, sort order by UTF-8 byte value, and the character guidance.
- [Amazon S3 — Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html) — delete markers, version ids, and how `GET` behaves against a marker.
- [Amazon S3 — Working with object metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html) — the 8 kB header cap, the 2 kB user-metadata cap, and exactly which ETag is an MD5.

> **CHAPTER 1 SUMMARY**
>
> S3 is a flat map from a string to a byte array, and every interesting property of the
> service is a consequence of that. There are no folders; the `/` in a key is a character,
> the console's directories are a client-side group-by, and prefix listing works for
> exactly one reason — all keys with a shared prefix are contiguous in the UTF-8 byte-value
> sort order, so a prefix is a range rather than a traversal. Immutability, no secondary
> indexes, no transactions and no planner are not missing features; they are what makes the
> service scale. The two things that reliably catch teams out are versioning (a `DELETE`
> writes a zero-byte delete marker and removes no data) and the `ETag` (an MD5 only for a
> single-part unencrypted or SSE-S3 upload — use the checksum API otherwise).

## Chapter 2 — S3: Durability, Consistency & Availability

### 2.1 The 11 Nines, Precisely

S3 Standard is documented as designed for **99.999999999% durability** — eleven nines —
and **99.99% availability** monthly. The interview question is not "what is the durability
number", it is **"what does that number actually mean, and what is it a statement about?"**

```text
  READ THE NUMBER CORRECTLY
  ─────────────────────────
  99.999999999% durability = "if you store 10,000,000,000 objects, you should
  expect the loss of about 0.001 of them over the objects' lifetimes."

  It is a DESIGNED-FOR figure for the storage class, measured across the
  fleet, not a contractual SLA on your bucket. Two teams lose data: one
  because they read it as a guarantee and one because they read it as
  an uptime figure. It is neither.

  Availability (99.99% monthly for Standard) is the OTHER number, and it
  is the one that shows up in your SLO. Conflating the two — "S3 is 11
  nines available" — is the most common misstatement of this fact.
```

What the number is supported by, to the depth AWS documents it: general purpose bucket
objects are stored redundantly across **three or more Availability Zones** for the
multi-AZ classes, and within a single AZ for the `ONEZONE_IA` and `EXPRESS_ONEZONE`
classes. Availability Zones are separate physical data centres with independent power,
cooling and networking. That is the documented durability architecture. How many disks, what
erasure coding, what the repair and rebalancing machinery is doing — that is not something
AWS publishes, and the right interview posture is to say so rather than to guess.

The distinction that earns marks is between **durability** (will my bytes still be there in
ten years) and **availability** (can I reach them right now). One Zone-IA has *the same*
eleven-nines durability as Standard-IA — the redundancy strategy is the same — but 99.5%
availability and no protection against the loss of the AZ. You are buying the same
probability of silent bit rot for less money and taking a much higher probability of a
region-wide outage on you.

### 2.2 The Consistency Answer, Stated Correctly for Today

This is the one that has changed, and the one that will cost you marks if you give the
stale version. The historical answer was "S3 is eventually consistent for overwrite,
delete and list, and strongly consistent for new-object `PUT`." **That is no longer
accurate.** In December 2020 Amazon completed a large-scale deployment making `LIST`
strongly consistent, and the current documentation states:

- **Strong read-after-write consistency for `PUT` and `DELETE` requests of objects in your
  bucket, in all AWS Regions.** This covers writes of new objects, `PUT`s that overwrite
  existing objects, and `DELETE`s.
- **Strong consistency for reads of S3 Select results, ACLs, object tags, and object
  metadata (for example, `HEAD`).**
- **`LIST` is strongly consistent.** Any `GET` or `LIST` initiated after a successful `PUT`
  response returns the data written by that `PUT`.

The documented examples are worth quoting because they are exactly the interview cases:

```text
  WRITE THEN IMMEDIATELY OBSERVE — all of these now behave
  ────────────────────────────────────────────────────────────
  • write a new object, immediately LIST the bucket   → the object is there
  • replace an existing object, immediately GET it    → the new data
  • delete an existing object, immediately GET it     → nothing (404)
  • delete an existing object, immediately LIST       → the key is absent
```

If you are asked "is S3 eventually consistent?" the correct answer in 2026 is: **"No, not
for object operations. S3 has provided strong read-after-write consistency for `PUT` and
`DELETE` and strongly-consistent `LIST` since December 2020. If you are working from older
material, it will tell you list was eventually consistent and that overwrite and delete
were too — that answer is out of date."** Then, and this is what separates a senior from a
person who has memorised a doc page, add the caveat:

> **TRADE-OFF — "IF LIST IS STRONGLY CONSISTENT, IS THERE ANY EVENTUAL BEHAVIOUR LEFT?"**
>
> Yes, and it lives in **bucket configuration** rather than in object operations. The
> documented exceptions are:
>
> - **Bucket configuration is eventually consistent.** If you delete a bucket and
>   immediately list your buckets, the deleted bucket may still appear. If you enable
>   versioning on a bucket for the *first* time, the change takes a short time to
>   propagate, and AWS explicitly recommends waiting **15 minutes** before issuing `PUT` or
>   `DELETE` on objects in that bucket.
> - **Versioned delete-marker and re-creation cases.** Overwriting a `DELETE` marker and
>   the delete-then-immediately-recreate-of-the-same-key sequence are the cases where
>   practitioners still describe residual eventual behaviour, because the interaction is
>   between an object version and a marker rather than between two values of one key. Be
>   precise here rather than confident: the strongest accurate statement is that these
>   cases are governed by version semantics and concurrent-write rules rather than by the
>   strong read-after-write guarantee on the key's current version.
>
> The general rule to carry: **strong consistency is a property of object operations;
> configuration changes and multi-key operations are where the remaining asynchrony lives.**
> And because these are documented service behaviours that AWS has changed before, verify
> against the current
> [Amazon S3 data consistency model](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel)
> before you build an answer on it in an interview.

### 2.3 What This Changes in Your Architecture: the Invalidation Pattern

The strong-consistency change has a concrete architectural consequence that people miss,
because most cache-invalidation designs on S3 were built in the era when `LIST` and
overwrite were not strong. Consider the common pattern:

```text
  THE PRE-2020 REASON THIS PATTERN EXISTED
  ────────────────────────────────────────
  "The cache is keyed by a LIST of the prefix. LIST was eventually
   consistent, so a writer could not trust a read-after-write LIST and
   had to invalidate or retry."

  THE 2026 SITUATION
  ─────────────────
  The object operations are strong. If you PUT an object and then LIST,
  your LIST is consistent with your PUT. The stale-read problem on the
  LIST path is gone.

  WHAT IS STILL YOUR PROBLEM
  ────────────────────────
  • LIST is still paged at 1,000 keys and still billed per 1,000 keys.
  • A cache of a LIST result still has a TTL, and a TTL is a correctness
    decision you are making on purpose, not one S3 is imposing.
  • The event-notification path is still asynchronous and still
    at-least-once — S3 does not order events, does not deliver exactly
    once, and duplicates are routine.
  • Nothing here fixes cross-key atomicity. S3 has no atomic update
    across keys, documented explicitly, and no conditional "put only if
    the object does not exist" was historically absent — conditional
    writes (If-None-Match: *) now exist for PutObject and
    CompleteMultipartUpload and are the tool for create-if-absent.
```

The senior move is to say the sentence that shows you know the difference between a
*consistency model* and a *cache policy*: **"The data read is now consistent; the cache
still has a TTL, and the TTL is a business decision about how stale a directory listing is
allowed to be, not a workaround for a storage engine."** Volume 9 owns cache-aside and the
three classic cache bugs; the thing this chapter adds is that on S3 specifically, the
"eventual consistency" justification for one of them has expired.

### 2.4 Concurrency: There Is No Object Lock

Two more documented limits complete the picture, and both are the reason "S3 as a database"
fails in Chapter 5.

```text
  1. NO CONCURRENT-WRITER LOCKING
     Two simultaneous PUTs to the same key → the request with the latest
     timestamp wins. That is it. There is no compare-and-swap, no
     read-modify-write, no "fail if it changed".

     Consequence: S3 gives you no primitive for "increment this counter",
     no primitive for "insert this row if it does not exist" (until
     conditional writes arrived), and no primitive for "update only if
     the version is still X".

  2. UPDATES ARE KEY-BASED, NOT MULTI-KEY
     Documented explicitly: there is no way to make atomic updates across
     keys. You cannot make the update of one key depend on the update of
     another unless you build that into your application.

  3. THE MECHANISM THAT MAKES MULTIPART WORSE
     If two multipart uploads are started against the same key, the
     current version is decided by which upload was INITIATED most
     recently, not which completed. And if another operation deletes the
     key between your initiate and your complete, the complete can report
     success for an object you can no longer see.
```

That third point is a genuinely good staff-level observation and worth memorising: **in a
system where the key is the only identity and there is no lock, "the last writer wins" is
not a simplification — it is the full specification of the concurrency control.** Every
coordination protocol you build on top of S3 is code you wrote to supply a primitive the
service deliberately does not have.

> **MUST REMEMBER**
>
> Durability is a storage-design number (11 nines for the multi-AZ classes), availability
> is a monthly uptime number (99.99% for Standard), and consistency is strong for `PUT`,
> `DELETE`, `LIST` and metadata reads since December 2020. The three are different claims
> about different things, and an answer that merges them has not understood any of them.

#### Common Mistakes

- Saying "S3 is eventually consistent for overwrite and delete" — that was the state before
  December 2020 and it is now wrong for object operations
- Reading "11 nines of durability" as an availability or uptime figure
- Claiming S3 does exactly-once, ordered event delivery — notifications are asynchronous
  and at-least-once, with duplicates routine
- Assuming the strong `LIST` guarantee means a *cache* of a `LIST` result is fresh — a TTL
  is your decision, not S3's
- Forgetting the 15-minute propagation wait AWS recommends after enabling versioning on a
  bucket for the first time
- Assuming two concurrent `PUT`s to one key are serialised — they are not, and there is no
  object lock

#### Interview Questions — Durability, Consistency & Availability

**Q1. What does S3's 11-nines durability claim actually mean?** `TRICKY`

It is a designed-for figure for the storage class, expressed as a probability of data loss
over the lifetime of stored objects — put 10 billion objects in and expect to lose about a
thousandth of one over their lifetimes. It is not an availability number and not an uptime
figure; availability for S3 Standard is documented separately at 99.99% monthly. The
architecture behind the durability number, to the depth AWS documents it, is redundant
storage across three or more Availability Zones for the multi-AZ classes, with independent
power, cooling and networking per zone; the single-AZ classes have the same designed
durability with a much lower availability figure. And it is worth saying the disk-level and
erasure-coding details are not public — the honest answer knows where the documentation
stops.

**Q2. Is S3 eventually consistent?** `ADVANCED`

Not for object operations, and the old answer is now wrong. S3 provides strong
read-after-write consistency for `PUT` and `DELETE` in all Regions — new objects, overwrites
of existing objects, and deletes — and any `GET` or `LIST` started after a successful `PUT`
sees that data. Strong `LIST` landed in December 2020; the frequently repeated claim that
listing was eventually consistent is out of date. Strong consistency also covers `HEAD` and
object metadata, ACLs, tags and S3 Select results. What remains asynchronous is *bucket
configuration*: deleting a bucket and immediately listing buckets may still show it, and
enabling versioning for the first time takes time to propagate, with AWS recommending a
15-minute wait before writes. Versioned delete-marker and re-creation edge cases are
governed by version semantics rather than the key-level guarantee, and the disciplined move
is to say so and point at the current consistency-model documentation, because AWS has
changed this answer before and it is a legitimate question to raise in an interview.

**Q3. Two services both `PUT` to the same key. What happens, and what primitive would you
need to make it safe?** `ADVANCED`

The request with the latest timestamp wins, and that is the entire specification — S3
documents that it does not support object locking for concurrent writers, so there is no
serialisation and no error. If you need compare-and-swap, S3 has no primitive for it: no
read-modify-write, no "update only if the version is still X". The workarounds are
conditional writes (`If-None-Match: *` on `PutObject`, for create-if-absent), versioning as
an audit trail so you can detect and repair the lost write after the fact, or moving the
coordination into a store that offers conditional writes, which for most designs means a
conditional insert into a real database. The staff-level observation is that this is not a
gap to be worked around casually — every coordination protocol built on S3 is code you
wrote to supply a primitive the service deliberately does not have, and that code needs
retries, and the retries need idempotency.

**Q4. Durability and availability are different numbers. Where do they diverge most
sharply, and what are you trading?** `TRICKY`

In the single-AZ classes. `ONEZONE_IA` is documented as having the *same* 99.999999999%
designed durability as `STANDARD_IA` — the redundancy strategy is what produces the
eleven nines — but 99.5% availability and no protection against the loss of the Availability
Zone itself, against `99.9%` and multi-AZ resilience for Standard-IA. So durability here
is a statement about silent bit rot and hardware failure, and availability is a statement
about whether the region is reachable. The trade is: if the data is regenerable, one zone is
a reasonable bet and you have saved a meaningful fraction of the storage cost. If it is the
only copy of something you cannot regenerate, you have bought a small probability of
losing an entire region to save money on bytes, which is the wrong trade. The same reasoning
separates `EXPRESS_ONEZONE` — designed for single-digit-millisecond latency, explicitly
single-AZ, 99.95% availability — from Standard.

**Q5. Our cache of an S3 `LIST` result has a five-minute TTL. Given S3's consistency
guarantees, is that TTL necessary?** `TRICKY`

The TTL is not compensating for a storage-engine weakness any more. Since December 2020 a
`LIST` that follows a successful `PUT` is consistent with it, so there is no window in
which S3 shows you stale keys. What the TTL controls is your own cache, and it is a
business decision about how stale a directory view is allowed to be — which is a different
question and worth answering as one. The remaining asynchronous pieces are ones S3's
object-level consistency does not cover: event notifications are delivered
at-least-once, unordered, and with routine duplicates, so any cache you populate from
events needs its own idempotency; and `LIST` remains paged at 1,000 keys and billed per
1,000 keys, so a cached listing is partly a cost optimisation. The useful thing to say in
an interview is that the TTL's justification changed shape: it used to be
"compensating for eventual consistency", and now it is "bounding how stale our view is for
users, and reducing request cost" — which is a much easier thing to defend and a much more
honest one.

#### Further Reading

- [Amazon S3 — Amazon S3 data consistency model](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel) — the authoritative statement of what is strong, what is atomic, and what is eventually consistent.
- [Amazon S3 — Concurrent applications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ApplicationConcurrency) — last-writer-wins semantics and the diagrams for concurrent writes.
- [Amazon S3 — Comparing the Amazon S3 storage classes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html#sc-compare) — durability, availability, AZ count, minimum duration and billable object size per class, in one table.
- [Amazon S3 — Amazon S3 event notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html) — delivery guarantees, ordering, and the duplicate-message reality.

> **CHAPTER 2 SUMMARY**
>
> Three different numbers describe three different things, and the interview marks are in
> keeping them apart: 99.999999999% durability is a designed-for data-loss probability for
> the storage class; 99.99% availability is the monthly uptime figure for Standard; and
> consistency is strong for `PUT`, `DELETE`, `LIST` and metadata reads across all Regions
> since December 2020. The stale "eventually consistent for overwrite, delete and list"
> answer is now wrong and is worth correcting out loud. What remains asynchronous is bucket
> configuration — including the documented 15-minute wait after first enabling versioning —
> and multi-key operations, which S3 does not support atomically at all. Concurrency is
> specified as last-writer-wins with no object lock, so any coordination on top of S3 is
> code you wrote to supply a primitive the service does not have.

## Chapter 3 — S3: Storage Classes, Lifecycle & Cost

### 3.1 The Classes, and the Two Columns That Decide Everything

The storage class list is long enough that candidates recite it and learn nothing. The
useful version sorts every class on two axes that actually matter: **what does it cost to
store, and what does it cost to read**. Everything else follows.

| Class | Durability (designed) | Availability | AZs | Min duration | Min billable size | Access |
| --- | --- | --- | --- | --- | --- | --- |
| `STANDARD` | 99.999999999% | 99.99% | ≥ 3 | none | none | millisecond |
| `STANDARD_IA` | 99.999999999% | 99.9% | ≥ 3 | **30 days** | **128 KB** | millisecond, per-GB retrieval fee |
| `ONEZONE_IA` | 99.999999999% | 99.5% | **1** | **30 days** | **128 KB** | millisecond, per-GB retrieval fee |
| `INTELLIGENT_TIERING` | 99.999999999% | 99.9% | ≥ 3 | none | none | automatic; **no retrieval fee** |
| `EXPRESS_ONEZONE` | 99.999999999% | 99.95% | **1** | none | none | single-digit ms |
| `GLACIER_IR` | 99.999999999% | 99.9% | ≥ 3 | **90 days** | 128 KB | millisecond, per-GB retrieval fee |
| `GLACIER` | 99.999999999% | 99.99% (after restore) | ≥ 3 | **90 days** | n/a | **restore first**, minutes to hours |
| `DEEP_ARCHIVE` | 99.999999999% | 99.99% (after restore) | ≥ 3 | **180 days** | n/a | **restore first**, hours |

(Figures are from the current
[storage class comparison](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html#sc-compare);
pricing moves, minimum durations and billable sizes do not, but verify before you quote a
number in an interview.)

Two rows in that table are doing all the work.

**The 128 KB minimum billable size.** `STANDARD_IA`, `ONEZONE_IA` and `GLACIER_IR` all
charge you for 128 KB of storage even if the object is 3 kB. This is not a rounding
convenience; it is what makes the class profitable at all, and it means **the IA classes
are actively wrong for small objects.** A million 4 kB thumbnails is 4 GB of real data
billed as 128 GB. Put a small-object workload in `STANDARD` or `INTELLIGENT_TIERING`.

**The minimum storage duration and the early-delete charge.** This is the number people
get burned by, so state it exactly: if you delete, overwrite, or transition an IA object
before its 30-day minimum, you are charged the **normal storage charge plus a pro-rated
charge for the remainder of the 30 days**. For `GLACIER_IR` the minimum is 90 days; for
`GLACIER` it is 90 days; for `DEEP_ARCHIVE` it is 180 days. The rule is the same shape in
each case: you pay for the whole minimum whether or not the bytes were there.

> **SCALING REALITY CHECK — THE 30-DAY BILL**
>
> A nightly job writes a full 2 TB export, a retention rule moves it to `STANDARD_IA` at
> day 30, and a bug means the job starts failing at day 3. The rule deletes the partial
> output. The team expects the storage cost to go back to normal in a day. Instead that
> 2 TB is billed for the full 30-day minimum, every night, for 27 more nights — and because
> the job runs nightly, the "deleted" objects are being recreated each night and charged
> again. The fix is not clever storage design; it is a lifecycle rule that transitions on
> *age of success* rather than on a schedule the failing job keeps re-triggering, plus a
> budget alarm on `PutObject` volume. The lesson to carry: **minimum storage durations make
> your storage cost a function of your worst recent week, not your current state.**

### 3.2 Lifecycle Rules, and the Two Actions Everybody Forgets

A lifecycle configuration is a set of rules on a bucket, each scoped by a filter (prefix,
tag, or object-size) and a set of actions.

```text
  THE TWO ACTION FAMILIES
  ───────────────────────
  TRANSITION  — move the object to another storage class when it is N days old
  EXPIRATION  — delete the object (creating a delete marker in a versioned bucket)
                when it is N days old

  THE STATE MACHINE
  ─────────────────
     upload
        │
        ▼
   ┌─────────┐   transition at day 30    ┌──────────────┐
   │STANDARD │ ────────────────────────▶ │ STANDARD_IA  │
   └─────────┘                          └──────────────┘
        │                                     │ transition at day 120
        │                                     ▼
        │                              ┌──────────────┐
        │                              │ GLACIER_IR   │
        │                              └──────────────┘
        │                                     │
        │   expire at day 365                    │ transition at day 400
        ▼                                     ▼
   ╔═════════╗                          ┌──────────────┐
   ║ DELETED ║                          │   GLACIER    │  ── must RESTORE before read
   ╚═════════╝                          └──────────────┘
   expiry is measured from object        expire at day 1825
   CREATION, not from last transition     ▼
                                          ╔═════════╗
                                          ║ DELETED ║
                                          ╚═════════╝
```

Three things about that diagram that are routinely wrong in interviews:

1. **Expiry age is measured from object creation, not from the last transition.** A rule
   that transitions at day 30 and expires at day 60 means "delete at 60 days after upload",
   i.e. 30 days in the IA class. Because IA has its own 30-day minimum, deleting at exactly
   day 60 is fine; transitioning to IA at day 31 and expiring at day 60 is not.
2. **Lifecycle transitions are asynchronous.** The object does not move at second 30 of
   day 30; S3 applies the rule on its own schedule. If you `GET` the object and inspect its
   storage class, you may see the old class for hours. A workflow that transitions and then
   immediately checks the storage class and asserts on it will flake.
3. **Lifecycle does not apply to objects smaller than 128 KB for transition into an IA or
   archive class.** A `STANDARD_IA` transition on 4 kB objects is silently not applied, and
   you keep paying Standard prices for data you thought you had archived. Verify this
   against current documentation — the exact behaviour of transitions into the one-zone and
   single-AZ classes has changed over time.

> **INTERVIEW TRAP — "WE PUT EVERYTHING ON GLACIER TO SAVE MONEY"**
>
> The class name does most of the damage here. `GLACIER` and `DEEP_ARCHIVE` objects are
> **not directly readable**. You must issue a `RestoreObject` first, and restore takes
> minutes to hours (Deep Archive: hours). Every read path that touches archived data
> becomes an asynchronous operation with a completion callback, and any code written as
> though `GET` returns bytes will hang, timeout, or — worse — return a `Restore` error
> that a careless handler treats as "no such object." The decision is a two-sided cost: you
> save a large fraction of the storage bill and you pay a retrieval fee per GB, a
> restore-in-progress failure mode, and a latency budget that is now minutes. The correct
> senior framing is that **archival storage is a promise about when you will need the data
>**, and if the answer is "sometimes, and I need it now", the class is `GLACIER_IR`, which
> is millisecond and has a 90-day minimum instead of 180.
>
> And there is a fourth Glacier-class name that catches people out: when using S3 Glacier
> storage classes inside S3, your objects remain in Amazon S3 and **cannot be accessed
> through the separate Amazon Glacier service**. Two different services, one confusing
> brand name.

### 3.3 The Request Pricing Model, and How a Cache Optimisation Costs More

S3 bills three separate things: **storage per GB-month**, **requests per 1,000**, and
**data transfer out**. The request model is where the "we optimised it" anecdote lives,
because the *cheap* class is priced on a different axis than the one you optimised.

```text
  REQUEST PRICING IS PER 1,000 REQUESTS, AND THE CLASS CHANGES THE RATE
  ───────────────────────────────────────────────────────────────────
  Every PUT, GET, LIST and COPY is a request. LIST is charged per 1,000
  keys RETURNED, not per call — so paginating 10,000 keys is 10 LIST
  requests, and a ListObjectsV2 that returns 1 key costs the same as one
  that returns 1,000.

  IA-class rates are typically a small multiple of Standard rates, and
  Standard-IA / One Zone-IA / Glacier IR add a PER-GB RETRIEVAL CHARGE on
  every read.

  THE ARITHMETIC THAT BITES
  ────────────────────────
  Storage is roughly $0.023/GB-mo (Standard) vs ~$0.0125/GB-mo (Standard-IA).
  A GET costs ~$0.0004 on Standard and ~$0.001 on Standard-IA (illustrative —
  check current pricing), plus a per-GB retrieval fee on IA.

  Break-even is therefore: if you read the object more than roughly
  once or twice per month, the retrieval fees alone exceed the storage
  saving. An access pattern of "read it a few times a day" is
  categorically wrong for an IA class.
```

Now the specific trap, which is the one worth learning the chapter for:

> **TRADE-OFF — "WE MOVED TO `STANDARD_IA` TO SAVE MONEY AND THE BILL WENT UP"**
>
> This is not a paradox, it is the per-GB retrieval fee meeting a read-heavy access
> pattern. A read-heavy workload paying a per-GB fee on every read will spend more on
> retrieval than it saved on storage, and the worse version of this is a **cache that
> misses**. A cache hit is free of the retrieval fee; a cache miss is not. So a badly
> sized cache makes IA *more* expensive than no cache on Standard, because every miss now
> costs a premium read plus a retrieval fee instead of a standard read. The two correct
> responses are (1) put the data in `STANDARD` if the access pattern is read-heavy, or (2)
> if the storage footprint is the real problem and the access is genuinely rare, use
> `INTELLIGENT_TIERING`, which has no retrieval fee at all and moves objects between tiers
> automatically based on observed access.
>
> The senior-level addition: `INTELLIGENT_TIERING` is the right default when you do not
> know or cannot predict the access pattern, and its monitoring charge per object means it
> is *not* right for millions of tiny objects — objects under 128 KB are not monitored and
> always stay in the Frequent Access tier. So the honest answer is not "always use
> Intelligent-Tiering"; it is "use it when the access pattern is genuinely unknown and your
> object sizes are not tiny, and otherwise pick from the table."

### 3.4 Egress, the Bill That Surprises Everyone

The third billable axis is **data transfer out of the Region to the internet**, and it is
the one that produces the emergency conversation, because it is not obviously *storage*.

```text
  THE FOUR BILLABLE AXES — remember all four, quote them in this order
  ───────────────────────────────────────────────────────────────────
  1. STORAGE          per GB-month, per storage class
  2. REQUESTS         per 1,000 PUT / GET / LIST / COPY
                      (LIST per 1,000 keys returned)
  3. DATA TRANSFER    per GB out of the Region
      OUT             — free INTO S3, which is why "we back up to S3" is
                       nearly free, and why "we serve a 40 GB dataset
                       from S3 to our web tier" is not
  4. RETRIEVAL FEES   per GB, IA and archive classes only

  THE STRUCTURAL CONSEQUENCE
  ─────────────────────────
  A free egress rule (S3 → EC2 in the same Region, or through a VPC
  endpoint) changes your architecture, not just your bill. If 90% of
  reads come from EC2 in the same Region, adding a gateway VPC endpoint
  removes the transfer line entirely AND keeps the traffic on the AWS
  backbone. That is a better answer than "we should cache more".
```

> **PRODUCTION SCENARIO**
>
> Problem: a media company's monthly S3 bill quadruples in a month with no growth in object
> count and no traffic increase. Storage dashboards look flat.
> Investigation: the cost breakdown separates storage, requests and transfer. Storage and
> request counts are unchanged; data transfer out rose by roughly 4×. CloudTrail shows an
> automated analytics job that began reading full 3 GB parquet files daily for a new
> customer report, running from an EC2 instance in a *different* Region from the bucket.
> Root cause: the job was written to run in `us-west-2` while the bucket is in `eu-west-1`,
> so every nightly run moved 3 GB across the public internet egress path, and because the
> files are large, per-request efficiency gains do nothing — the transfer line dominates.
> Solution: the job was moved into the bucket's Region, and the bucket got a gateway VPC
> endpoint for the remaining intra-Region reads.
> Prevention: a cost-allocation tag on every job that reads S3 at volume, a budget alarm on
> the `BytesDownloaded` dimension rather than on the total bill, and a documented rule that
> any S3 analytics job declares its Region in its runbook.

### 3.5 Storage Lens, and Reading Your Own Storage

**S3 Storage Lens** provides more than sixty usage and activity metrics with interactive
dashboards, aggregatable by organisation, account, Region, bucket or prefix, and it is the
tool for answering the question this chapter keeps raising: *what is my access pattern,
really?* Three specific capabilities matter:

- **Storage Lens metrics** — the activity and usage numbers, including request counts by
  type, which is how you find the workload that is quietly paying for 10,000 `LIST` calls a
  day.
- **Storage Lens groups** — define a subset of objects by prefix, tag, or age and get
  metrics for exactly that group. This is how you answer "how much of this bucket has not
  been read in 90 days" without a data job.
- **S3 Inventory** — a scheduled manifest of every object with its size, storage class and
  metadata, delivered to a destination bucket. For millions of objects this is the only
  sane way to answer a question about your whole bucket, because it converts an
  unbearably expensive `LIST` scan into a table you can query with Athena.

The staff-level habit worth naming: **you cannot pick a storage class from a guess.** The
recommendation is to run Storage Lens or Storage Class Analysis for a month *before*
writing lifecycle rules, because the transition rules you write are irreversible in the
sense that an object moved to `DEEP_ARCHIVE` and then needed immediately is a restore plus
a retrieval fee plus a user-facing outage, and that outage is caused by a rule nobody
revisited because the dashboard said storage was fine.

#### Common Mistakes

- Believing `STANDARD_IA` is a free 50% — the per-GB retrieval fee can make a read-heavy
  workload more expensive than `STANDARD`, and a cache miss makes it worse
- Putting small objects in an IA class and paying the 128 KB minimum on every one
- Forgetting the minimum storage duration and the early-delete charge, and being surprised
  by a bill that persists after the data is gone
- Treating lifecycle transitions as synchronous and asserting on `x-amz-storage-class`
  immediately after writing the rule
- Believing `GLACIER` objects are readable on `GET` — they need a `RestoreObject` first
- Forgetting that data transfer *out* is billed and that a cross-Region analytics job is
  the classic source of a five-figure surprise

#### Interview Questions — Storage Classes & Cost

**Q1. A team moved 10 TB of data to `STANDARD_IA` to cut cost. Six weeks later the bill is
higher. Explain.** `ADVANCED`

Because `STANDARD_IA` adds a per-GB retrieval charge on every read and raises the per-1,000
request rates, so the saving is only realised if the access rate is genuinely low — roughly
once or twice a month or less. If anything in the system reads those objects on a hot path,
the retrieval fees alone exceed the storage saving. It is made worse by a cache that misses,
because a miss is now a premium-rate read plus a retrieval fee rather than a standard read.
The correct response depends on why the data was moved: if the access pattern really is rare,
the fault is that they estimated it rather than measuring it, and Storage Class Analysis or
Storage Lens would have shown it. If the access is read-heavy, the class is simply wrong
and `STANDARD` — or `INTELLIGENT_TIERING`, which has no retrieval fee and retiers
automatically — is the fix. The transfer and request lines should also be checked before
blaming storage, because a cross-Region job moves both.

**Q2. What are the minimum storage durations, and what is the consequence of deleting early?**
`TRICKY`

`STANDARD_IA` and `ONEZONE_IA` are 30 days, `GLACIER_IR` and `GLACIER` are 90 days, and
`DEEP_ARCHIVE` is 180 days. Deleting, overwriting, or transitioning an object before its
minimum has been met incurs the normal storage charge **plus a pro-rated charge for the
remainder of the minimum** — you pay for the whole period whether the bytes were there or
not. The class of bug this produces is a storage bill that reflects your worst recent week
rather than your current state: a nightly job that fails and is cleaned up for 27
consecutive days keeps paying 30-day minimums on data that was deleted the same morning.
There is a second trap in the same area: the IA and `GLACIER_IR` classes have a 128 KB
minimum billable object size, so small objects are billed as 128 KB, and lifecycle
transitions into an IA class are not applied to objects below that size — so a rule you
wrote for a bucket of small objects silently does nothing.

**Q3. Why is `INTELLIGENT_TIERING` often the right default, and when is it not?** `STAFF`

Because it removes the guessing. You do not declare an access pattern, S3 monitors objects
and moves them between a Frequent Access tier, an Infrequent Access tier after 30
unaccessed days, and an Archive Instant Access tier after 90, with two opt-in deeper tiers
at 90 and 180 days, and crucially there is no per-GB retrieval fee. So it is correct
when the access pattern is genuinely unknown or changing, which is most of the time. It is
not correct in two cases worth naming: millions of very small objects, because the
per-object monitoring and automation charge dominates and objects under 128 KB are not even
monitored — they always sit in the Frequent Access tier — and cases where you *do* know the
pattern, because a fixed class with no monitoring charge is cheaper. It is also a poor fit
if you have a hard compliance requirement to keep data in a specific class, since the class
becomes a moving target you cannot assert on.

**Q4. Our nightly analytics job reads 3 GB of parquet from S3. The bill line that moved is
"data transfer out". Why, and what is the fix?** `TRICKY`

Data transfer out of the Region is a separate billable axis from storage, and it is free
*into* S3 — which is why backup-to-S3 is nearly free and serving a large dataset from S3
to a web tier is not. If the job runs in a different Region from the bucket, every nightly
run is a public-egress transfer, and because the objects are large the per-request
efficiencies of caching or compression do nothing about it. The structural fix is to move
the compute into the bucket's Region and add a gateway VPC endpoint for the remaining
intra-Region reads, which removes the transfer line and keeps traffic on the AWS backbone.
The prevention is a budget alarm on the transfer dimension specifically rather than on the
total bill, because a total-bill alarm tells you something is wrong without telling you
which of the four axes moved.

**Q5. A lifecycle rule transitions objects to `STANDARD_IA` at 30 days and expires them at
60. Is that a valid configuration?** `TRICKY`

It is valid, and it is exactly on the edge, which is why it is worth reasoning about rather
than just asserting. Expiration age is measured from object *creation*, not from the last
transition, so "expire at 60 days" means 30 days in the IA class — precisely meeting the
30-day minimum, so no early-delete charge. Move the expiry to 45 days and every object is
deleted 15 days into a 30-day minimum and you eat a pro-rated charge on all of it. The
second thing to know is that transitions are asynchronous: the object does not change class
at second 30 of day 30, S3 applies the rule on its own schedule, so a workflow that
transitions and then immediately reads `x-amz-storage-class` and asserts on it will
intermittently fail. And the third is that transitions into IA and archive classes are not
applied to objects under 128 KB, so on a bucket of small objects this rule does nothing at
all while the dashboard shows the objects sitting in `STANDARD` at full price.

**Q6. How would you decide, for a given bucket, what storage classes to use?** `STAFF`

Measure first, because the whole class decision is a function of access rate and the
reflexive answer is a guess. S3 Storage Lens gives activity and usage metrics aggregatable
by prefix and tag, and Storage Class Analysis reports the access patterns for the objects
in a bucket specifically to help you choose between Standard and Standard-IA. Then apply
three filters. First, *access rate*: more than roughly monthly reads means Standard, and
unknown means Intelligent-Tiering. Second, *regenerability*: if the AZ could be lost
outright, single-AZ classes are only defensible for data you can rebuild, and that also
governs whether you can use `ONEZONE_IA` or `EXPRESS_ONEZONE` at all. Third, *retrieval
latency requirement*: anything on a user-facing path that cannot tolerate a restore should
not be in `GLACIER` or `DEEP_ARCHIVE` at all, and `GLACIER_IR` is usually the right answer
instead. The thing I would add unprompted is that the rules you write are hard to revise —
an object moved to Deep Archive and needed immediately is a restore, a retrieval fee, and
a user-facing outage — so the month of measurement is cheaper than the incident.

#### Further Reading

- [Amazon S3 — Understanding and managing Amazon S3 storage classes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html) — the comparison table with durability, availability, AZ count, minimum duration and billable object size.
- [Amazon S3 — Storage class pricing](https://aws.amazon.com/s3/pricing/) — the four billable axes and the current per-class rates.
- [Amazon S3 — Managing the lifecycle of objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html) — transition and expiration rules, the state machine, and the filtering options.
- [Amazon S3 — Amazon S3 Storage Lens](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage_lens.html) — the metrics, dashboards, and groups for answering "what is my access pattern actually".

> **CHAPTER 3 SUMMARY**
>
> Storage class is not a cheaper-vs-faster dial; it is a two-axis decision between monthly
> storage cost and per-GB retrieval cost, with a minimum duration that makes your bill a
> function of your worst recent week. `STANDARD_IA` and `ONEZONE_IA` carry a 30-day
> minimum and a 128 KB billable floor, `GLACIER_IR` and `GLACIER` 90 days, `DEEP_ARCHIVE`
> 180 — and deleting early costs the pro-rated remainder regardless. A read-heavy workload
> on an IA class can cost more than storing it twice, because a cache *miss* now carries a
> premium read rate plus a retrieval fee. The four billable axes are storage, requests per
> 1,000, data transfer out, and retrieval fees, and the last two are the ones that produce
> emergency calls. The right process is a month of Storage Lens or Storage Class Analysis
> data *before* writing lifecycle rules, because an object archived and needed immediately
> is a user-facing outage caused by a rule nobody revisited.

## Chapter 4 — S3: Access Control, Presigned URLs & Multipart

### 4.1 The Policy Intersection

There are three places a permission can come from — an IAM identity policy, a bucket
policy, and (legacy, and AWS's recommendation is to leave it off) an ACL — plus a bucket's
Block Public Access settings, which can veto the result. The rule that everyone gets wrong
is how they combine.

```text
  SAME-ACCOUNT:          the two policies are INTERSECTED (logical AND)
  ─────────────────      an explicit Deny anywhere wins
                         → allow if BOTH the identity policy AND the
                           bucket policy allow

  CROSS-ACCOUNT:         the two are UNIONed (logical OR) for Allow,
  ─────────────────      and a Deny in EITHER still wins
                         → this is the only way a bucket owner can
                           grant a principal that its own account
                           policies would not permit

  ACLs (if enabled)      folded into the same evaluation; S3 recommends
  ─────────────────      keeping ACLs disabled, with Object Ownership
                         set to "Bucket owner enforced" (the default)

  BLOCK PUBLIC ACCESS    a bucket-level veto over the whole evaluation
  ─────────────────      (on by default at the bucket level today)
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadOnlyFromCdnRole",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/cdn-origin" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::acme-media/*"
    },
    {
      "Sid": "DenyAnyPutOutsideTheUploadPrefix",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::acme-media/uploads/*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

Three practical notes on the mechanics. A bucket policy is capped at **20 KB**, so a policy
that enumerates thousands of ARNs is a sign you want IAM groups or access points instead.
`Resource` wildcards are byte-greedy: `arn:aws:s3:::bucket/*` matches every key including
every prefix, which is exactly the over-broad grant Chapter 4's presigned section is about.
And conditions are where real authorisation lives — `s3:signatureAge` to bound presigned
URL age, `aws:SecureTransport` to require TLS, `aws:SourceVpc` to require the request came
through a VPC endpoint, and `s3:ExistingObjectTag` to make access depend on a tag the
writer set.

### 4.2 Presigned URLs: What Is Actually Signed

A presigned URL is not an access-control configuration. **It is a bearer token** — a
cryptographic signature over a specific set of request parameters, which grants whatever its
creator's credentials could grant, for the expiry you chose, to anyone who holds the string.
AWS says this plainly in the documentation, and the security model follows from it: treat a
presigned URL like a password.

The signature covers:

```text
  WHAT A SigV4 PRESIGNED URL SIGNS
  ──────────────────────────────
  X-Amz-Algorithm      AWS4-HMAC-SHA256
  X-Amz-Credential     access-key-id / 20260927 / region / s3/aws4_request
                       ── SCOPED TO THE DAY AND THE REGION. The URL is not
                          valid on any other date or in any other Region.
  X-Amz-Date           the signing instant
  X-Amz-Expires        seconds until expiry
  X-Amz-SignedHeaders  the headers that must be present and unmodified
  X-Amz-Signature      HMAC-SHA256 over the canonical request

  IT DOES NOT COVER
  ────────────────
  the request body, the client's identity (there is none), or anything
  the holder does with the bytes once they have them. Anyone holding
  the URL has the capability.
```

Expiry has a hard ceiling and a subtle trap. With the CLI or the SDKs the maximum is
**7 days** — and to get there you must be using long-lived IAM user credentials, which
AWS explicitly warns about. More importantly: **a presigned URL expires at the earlier of
its configured expiry and the expiry of the credentials that signed it.** If you sign with
role credentials, the URL dies when the role session ends, and an EC2 instance-profile role
typically rotates every few hours, so a "24-hour" download link quietly stops working in
six. S3 checks the expiry at the time of the HTTP request, so a download that *starts*
before expiry continues after it, but a resume after a dropped connection fails.

```text
  THE TWO TRAPS, IN ORDER OF HOW OFTEN THEY BITE
  ──────────────────────────────────────────────
  1. CREDENTIAL-BOUND EXPIRY
     presign with a role → dies with the session, often hours later
     presign with an IAM user to get 7 days → long-lived credentials
     exist, and that is a worse problem than the one you were solving
     → the honest answer is: shorten the expiry, not extend the credential

  2. SCOPE
     the signature binds a METHOD and a KEY. Sign GET on
     "reports/customer-42/q1.pdf" and that is the whole capability.
     Signing a prefix, or signing with a wildcard, or signing the
     bucket root, produces a URL that grants everything under it.
```

> **INTERVIEW TRAP — "WE PRESIGN THE PREFIX AND LET THE CLIENT PICK THE FILE"**
>
> Presigned URLs are for one object. The signature binds a method and a key, and a client
> that can choose the key can reach anything the signer's credentials allow under that
> pattern. The moment the sign function takes a filename from the request and interpolates
> it into the key, you have written a bucket-write primitive reachable by anyone who can
> call your sign endpoint — and a bucket-write primitive in a prefix you did not fully
> control is a data-destruction primitive, since S3 has no atomic multi-key update and
> last-writer-wins. The safe shape is: the server resolves the identifier to a key from its
> own authoritative data (an upload record, a database row), the client never supplies key
> material, the method is fixed to the single verb needed, and the expiry is minutes rather
> than days. If you want a durable link, the durable mechanism is an application that
> re-signs on demand — not a long-lived signature.

### 4.3 Serving User Uploads Without Handing Over Your Origin

Uploads are where S3 access control meets content-type handling, and the two interact in a
way that produces stored XSS. The mechanics that matter:

- `Content-Type` is a **system-controlled metadata header the client chooses**. If you
  upload a user's file with whatever `Content-Type` the browser supplied and then serve it
  from your domain, a file containing `<script>` uploaded as `text/html` executes on your
  origin. This is the single most common real S3 vulnerability.
- `Content-Disposition` controls how the browser treats the response —
  `attachment; filename="report.pdf"` forces a download rather than inline rendering, and
  it is the second half of the defence.
- Server-side encryption is a per-object `PUT` parameter, not a bucket-only setting, and
  the KMS decrypt permission is needed to read a checksum back off a `SSE-KMS` object.
- `POST` policy uploads (browser form uploads) are the alternative to a presigned `PUT`,
  and they let you constrain key prefix, content-length range, and the exact set of form
  fields — which is strictly safer than a presign because the browser cannot pick an
  arbitrary header.

```text
  THE DEFENCE, IN ORDER
  ────────────────────
  1. Serve user content from a SEPARATE bucket (ideally a separate
     domain) from your application's own origin, so a stored XSS in
     user content cannot read your application's cookies.
  2. Force Content-Type on the way out, or force
     Content-Disposition: attachment. Never let a user-supplied
     text/html be served from a trusted origin.
  3. If you must render inline, set an explicit
     Content-Security-Policy and X-Content-Type-Options: nosniff.
  4. Enforce Block Public Access on the upload bucket; serve through
     CloudFront with Origin Access Control rather than a public bucket.
  5. For browser uploads, use a POST policy with a key prefix and a
     content-length-range condition rather than an unbounded presign.
```

> **PRODUCTION RELEVANCE**
>
> The reason this belongs in a database interview guide rather than a security one is that
> the failure is a *data* failure. An attacker who can write an arbitrary key in your prefix
> can overwrite an object another user's download link points at — last-writer-wins, no
> conditional update, no error. The recovery is a versioned bucket and a restore, which is
> possible only if you enabled versioning before the incident. That is why "did we turn on
> versioning" is a data-protection question and not a storage question.

### 4.4 Multipart Upload: The Limits, and the Silent Cost

Multipart upload is a three-step protocol: `CreateMultipartUpload` returns an upload id,
`UploadPart` sends parts (in any order, any numbering), `CompleteMultipartUpload` assembles
them in ascending part-number order. It exists for three real reasons — parallel throughput,
retry granularity on a flaky link, and being able to begin an upload before you know the
final size.

The limits are the part of this that gets asked, and they are worth having exactly:

```text
  MULTIPART LIMITS (verify against current docs before quoting)
  ─────────────────────────────────────────────────────────
  • Part size:        5 MB minimum (any part except the last),
                      5 GB maximum
  • Part count:       1 to 10,000
  • Part numbers:     need not be consecutive — EXCEPT when you are
                      using checksums, where they must be
                      consecutive starting at 1, and a non-consecutive
                      CompleteMultipartUpload is rejected with HTTP 500
  • Object size:      5 TB maximum (10000 × 5 GB is how you get there)
  • Expiry:           NONE. Parts are retained until you Complete or
                      Abort. There is no automatic cleanup.
  • Metadata:         must be supplied at CreateMultipartUpload time;
                      you cannot add user metadata at Complete
  • Re-uploading a part number: overwrites the previous part silently
```

That "no expiry" line is the cost, and it is the one that produces a real bill:

```text
  ABANDONED MULTIPART — THE SILENT LEAK
  ───────────────────────────────────
  A client starts a 500 GB upload, the Lambda times out, the client
  never calls AbortMultipartUpload. The 400 GB already uploaded are
  BILLED, indefinitely, at the storage class of each part. The object
  does not exist. Nobody can see it. It does not appear in a normal
  bucket listing, only in ListMultipartUploads.

  THE FIX IS A LIFECYCLE RULE, NOT DISCIPLINE
  ──────────────────────────────────────────
  { "Rules": [ { "ID": "abort-incomplete-mpu",
                 "Status": "Enabled",
                 "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 },
                 "Filter": { "Prefix": "" } } ] }

  Notes worth having: the parts are billed at the storage class they
  were uploaded with, and while the upload is in progress the
  CreateMultipartUpload and UploadPart calls are billed at S3 Standard
  rates. Aborting does not incur early-delete charges, and aborting is
  what actually frees the bytes. A large team will have both a
  lifecycle rule AND a periodic ListMultipartUploads alarm, because
  the rule is what cleans up and the alarm is what tells you the rule
  stopped working.
```

```bash
# The three calls, at a glance
aws s3api create-multipart-upload --bucket acme-media --key video/large.mp4
# → {"UploadId": "abc123..."}

aws s3api upload-part --bucket acme-media --key video/large.mp4 \
    --upload-id abc123... --part-number 1 --body part1.bin
# → {"ETag": "\"9bb58f16...\"", "ChecksumCRC64NVME": "..."}

aws s3api complete-multipart-upload --bucket acme-media --key video/large.mp4 \
    --upload-id abc123... --multipart-upload file=parts.json
# → object created; the object ETag is a checksum of checksums, e.g. "...-17"
```

#### Common Mistakes

- Believing identity policy and bucket policy are unioned for the same account — they are
  intersected, and an explicit `Deny` anywhere wins
- Treating a presigned URL as a scoped capability when it is a bearer token whose scope is
  exactly the method and key that were signed
- Presigning with a wildcard or prefix and assuming the client "can only pick a filename"
- Presigning with role credentials and issuing 24-hour links that die in six
- Serving user uploads with the client's own `Content-Type` from a trusted origin — stored XSS
- Assuming multipart uploads clean themselves up; they do not, and abandoned parts are
  billed indefinitely
- Comparing the object ETag to a body MD5 after a multipart upload

#### Interview Questions — Access Control, Presigning & Multipart

**Q1. How do an IAM identity policy and a bucket policy combine?** `TRICKY`

For principals in the same account they are intersected — the request is allowed only if
both the identity policy and the bucket policy allow it — and an explicit `Deny` in either
one wins over any `Allow`. For cross-account principals the two are unioned for `Allow`,
which is the only mechanism by which a bucket owner can grant a principal something its own
account policies would not permit, and a `Deny` in either still wins. ACLs, where enabled,
fold into the same evaluation, which is why AWS now recommends keeping them disabled with
Object Ownership set to "Bucket owner enforced" — that is the default. Above all of this
sits Block Public Access, a bucket-level veto that is on by default at the bucket level
today. Two practical consequences worth volunteering: a bucket policy is capped at 20 KB, so
a policy enumerating thousands of ARNs is a signal you want IAM groups or access points;
and the interesting authorisation lives in `Condition` — `s3:signatureAge` to bound
presigned-URL age, `aws:SecureTransport` for TLS, `aws:SourceVpc` for endpoint-only access,
`aws:PrincipalTag`, and `s3:ExistingObjectTag` for tag-based access.

**Q2. What exactly does an S3 presigned URL grant, and what are its sharp edges?** `TRICKY`

A bearer token. The signature is an HMAC over the canonical request and binds the HTTP
method, the object key, the signing date, the region, the expiry, and the set of signed
headers — `X-Amz-Algorithm`, `X-Amz-Credential` scoped to `date/region/service/aws4_request`,
`X-Amz-Date`, `X-Amz-Expires`, `X-Amz-SignedHeaders`. It does not bind an identity, because
there is no identity; anyone holding the string has the capability, which is why the
documentation tells you to protect it like a password. The sharp edges are three. The
maximum expiry is 7 days via the CLI or SDKs, and reaching it requires long-lived IAM user
credentials, which is a worse problem than the one you were solving. The URL expires at the
*earlier* of its configured expiry and the expiry of the signing credentials — presigning
with an EC2 instance-profile role gives you a link that dies in hours. And S3 checks expiry
at request time, so a download that started before expiry finishes, but a resume after a
dropped connection does not.

**Q3. We presign URLs server-side and let the client pass the filename. Is that safe?**
`ADVANCED`

No, and the reason is worth stating precisely: the signature binds a method and a key, so
any key the client can influence is capability the client can exercise. A sign endpoint
that accepts a filename and interpolates it into the key is a bucket read or write primitive
reachable by anyone who can reach that endpoint, constrained only by the signer's
permissions. A write primitive is the severe case, because S3 has no conditional update and
no atomic multi-key operation, so a client that can choose a key can overwrite the object
another user's download link points at, last-writer-wins, with no error and no audit beyond
CloudTrail. The safe shape is to resolve the identifier to a key from authoritative
server-side data, fix the method to the single verb needed, and make the expiry minutes
rather than days; for browser uploads, a `POST` policy with a key prefix and a
`content-length-range` condition is strictly better than a presign, because it constrains
the form fields the browser may send.

**Q4. Serving user-uploaded HTML from S3 behind CloudFront — what is the risk and the
mitigation?** `ADVANCED`

Stored XSS on your own origin. `Content-Type` is chosen by the uploader, so a file
containing `<script>` uploaded as `text/html` is served from your trusted domain and runs
with your cookies. The mitigations stack: serve user content from a separate bucket and,
better, a separate domain so the blast radius is bounded; force `Content-Type` on the way
out or force `Content-Disposition: attachment` so the browser downloads rather than renders;
add `X-Content-Type-Options: nosniff` and an explicit `Content-Security-Policy` if you must
render inline; keep Block Public Access on and front the bucket with CloudFront Origin
Access Control rather than a public bucket. The data angle is the part people miss: because
S3 is last-writer-wins with no conditional update, an attacker who can write an arbitrary key
in your prefix can destroy or replace another user's object, and recovery depends entirely on
versioning having been enabled *before* the incident. That is a data-protection decision, not
a storage-configuration one.

**Q5. What are the multipart upload limits, and what happens to an upload that is never
finished?** `TRICKY`

Parts range from 5 MB (any part except the last) to 5 GB, numbered 1 to 10,000, which is
how a 5 TB maximum object size is reachable; part numbers need not be consecutive, except
when using checksums, where they must start at 1 and be consecutive or the
`CompleteMultipartUpload` is rejected with an HTTP 500. Metadata is fixed at
`CreateMultipartUpload` time and cannot be added at completion, and re-uploading a part
number silently overwrites the earlier part. The unfinished-upload case is the expensive
one: **in-progress multipart uploads have no expiry**. The parts are retained and billed
indefinitely at the storage class they were uploaded with — with `CreateMultipartUpload` and
`UploadPart` billed at S3 Standard rates while in flight — and they do not appear in a
normal object listing, only in `ListMultipartUploads`, so a client that dies mid-upload
leaves an invisible, permanent charge. The fix is a lifecycle rule with
`AbortIncompleteMultipartUpload` (commonly 7 days) plus a periodic alarm on
`ListMultipartUploads`, because the rule cleans up and the alarm is what tells you the rule
stopped working.

**Q6. A teammate's report says "the ETag doesn't match our MD5, so the upload is
corrupt." Using multipart and SSE-KMS, what do you tell them?** `TRICKY`

That the check is invalid, not the upload. The ETag equals the body MD5 only for a
single-part upload of unencrypted data or SSE-S3 data. For multipart it is a checksum of
per-part checksums with a `-<n>` suffix, and for SSE-KMS or SSE-C the key participates, so
neither matches a body-side MD5; `CopyObject` produces an ETag computed from the source's
parts too. The correct verification is the dedicated checksum: S3 stores a per-object
checksum and supports CRC-64/NVME, CRC-32, CRC-32C, SHA-1 and SHA-256, defaulting to
CRC-64/NVME when an upload specifies nothing. For multipart, choose between a composite
per-part checksum and a full-object checksum computed at completion — the latter requires
consecutive part numbers from 1, and a `BadDigest` failure means the bytes genuinely do not
match. A useful addition to the review comment: if the client is computing an MD5 at all,
that is an extra full pass over the data on the client, which is a cost, and for large
uploads the SDK should be doing this incrementally per part instead.

#### Further Reading

- [Amazon S3 — How access control works in Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) — the union/intersection rules, Block Public Access, and the same-account versus cross-account distinction.
- [Amazon S3 — Using presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) — what is signed, the 7-day ceiling, credential-bound expiry, and the `s3:signatureAge` policy example.
- [Amazon S3 — Multipart upload overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) — the three-step process, the part limits, checksum rules, and the billing behaviour of in-progress parts.
- [Amazon S3 — Deleting incomplete multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html) — the `AbortIncompleteMultipartUpload` lifecycle action.

> **CHAPTER 4 SUMMARY**
>
> Access on S3 is an intersection of identity and bucket policy for same-account principals,
> a union of `Allow`s for cross-account ones, an explicit `Deny` always winning, and Block
> Public Access sitting above all of it — with the interesting authorisation in
> `Condition` keys. A presigned URL is not a configuration but a bearer token that binds
> one method and one key, expires at the earlier of its configured time and the signing
> credential's, and is capped at seven days only by sacrificing credential hygiene. Serving
> user content safely is a data question as much as a security one, because last-writer-wins
> with no conditional update means an over-broad write scope is a destruction primitive and
> versioning is the only recovery. Multipart gives you 5 MB to 5 GB parts, 10,000 of them,
> and a 5 TB ceiling — and in-progress uploads never expire, so a lifecycle
> `AbortIncompleteMultipartUpload` rule plus a `ListMultipartUploads` alarm is not optional
> hygiene, it is the difference between a bounded and an unbounded bill.

## Chapter 5 — S3: Anti-Patterns

### 5.1 The Failure Mode, Named Once

Every S3 anti-pattern in this chapter is one of two things, and naming them makes the
chapter short:

1. **Using a linear, paginated, billed scan as if it were a query.** The service will do it.
   It will cost you money, it will take seconds to minutes, and it will get worse linearly
   with data you did not write.
2. **Building a primitive S3 deliberately does not have** — atomicity, conditional update,
   ordering, exactly-once delivery, low-latency fan-out — out of application code, without
   counting the code as part of the system.

The second is worse, because the code is written once by someone clever and then operated
by everyone.

### 5.2 S3 as a Database

The pattern: write a JSON document per entity to `bucket/<entity>/<id>.json`, and "query" by
listing the prefix and filtering in the client.

```text
  "JUST PUT A JSON IN S3"
  ─────────────────────
  10,000,000 objects, average 4 kB each = 40 GB of data.

  One query — "all invoices for customer 4821" — implemented as:
      LIST prefix=invoices/  and filter keys for "4821"
  = 10,000,000 keys / 1,000 per response
  = 10,000 LIST requests
  = 10,000 sequential round trips
  = 10,000 × per-1,000-keys request charges
  = and the server has to sort and page a 10-million-key namespace
    to find your 6 rows

  And that is the CHEAP version, where the keys at least sort
  adjacently. If the layout is invoices/<id>.json, the objects for one
  customer are scattered across the entire keyspace and the scan is
  genuinely a full scan.
```

Three things to say about it, in increasing order of how much they should worry you:

- **It is quadratic in the wrong direction.** Cost per query grows linearly with total
  objects stored, not with rows returned. A table that gets more efficient as it gets
  bigger is a good table; this one gets worse.
- **It is billed.** `LIST` is charged per 1,000 keys returned, so the scan is a line item
  that grows with your data rather than with your traffic.
- **It is not atomic.** There is no transaction over the ten objects that make up one
  order, and no conditional update, so a partially-written aggregate is a state your
  application must define and defend.

What to do instead is not a database-shaped S3 layout, it is a different store. The
honest recommendation in a design review is a real table for anything queried, with S3 for
the *blobs* the rows point at — which is the shape almost every correct S3 architecture
actually has.

> **INTERVIEW TRAP — "WE USE S3 AS A DATABASE BECAUSE IT SCALES"**
>
> "It scales" is true in a way that has nothing to do with the claim being made. S3 scales
> *storage* — bytes in, bytes out, millions of objects — because it does almost nothing
> per object. It has no index, no query layer, and no transaction, and that is why it
> handles a hundred trillion objects. The inference people draw from "the bucket has ten
> million objects" to "the bucket is a ten-million-row table" is exactly backwards: the
> absence of those structures is what let it reach that number, and it is also why the
> store cannot answer a question about those ten million objects without scanning them.
>
> The right senior answer: S3 scales *durable object storage*. The access pattern it serves
> is "I know the key." If your question is "I know some of the key's attributes," you are
> in a store with an index — DynamoDB for a known access pattern, PostgreSQL for ad-hoc
> queries, Elasticsearch for search — and the S3 bucket holding the payloads is a
> *dependency* of that store, not a substitute for it.

### 5.3 Small Writes, Coordination by Key, and Notifications as a Bus

**Per-object small writes.** Writing 1,000 rows as 1,000 `PUT`s to 1,000 keys costs 1,000
requests, 1,000 round trips, and 1,000 chances to fail halfway. The batching mechanism is
not "write faster" — it is a bulk API. The S3 Batch Operations service performs
`Copy`, `Invoke AWS Lambda function` and `Restore` across millions or billions of objects
from a single S3 API request, driven by a manifest in S3. For a nightly job that rewrites
millions of small files, that is the difference between 1,000,000 requests and one.

```text
  THREE SHAPES, THREE COSTS (10,000 records, 1 kB each)
  ───────────────────────────────────────────────────────
  10,000 PUTs              10,000 requests, 10,000 round trips,
                           partial failure leaves a partial dataset

  1 PUT of a 10 MB bundle   1 request. BUT: no per-record access,
                           no partial read, no update-one-record,
                           and the whole bundle is one failure domain

  S3 Batch Operations       1 request for millions of objects,
                           with per-object failure reporting
```

**The same key as a coordination mechanism.** Because concurrent `PUT`s to one key are
last-writer-wins with no object lock, using a key like `bucket/locks/order-42` as a mutex
does not work. Two writers both "acquire" it; the second `PUT` silently overwrites the
first; there is no `If-Unmodified-Since` equivalent in the base API, and even the
conditional-write support that exists (`If-None-Match: *` on `PutObject`) is a
create-if-absent primitive, not a lock with a lease. Distributed locks need a store that
has them — Redis with a TTL, DynamoDB with a conditional write, or a database row — and
then you own the lease-expiry problem.

**S3 notifications as a message bus.** S3 can emit events to SNS, SQS or Lambda on object
creation. The properties that make it a message bus are the properties that make it a bad
one: delivery is **at-least-once**, so duplicates are routine and your consumer must be
idempotent; events are **not ordered**, so "created then deleted" can arrive inverted and
your consumer must tolerate a delete for an object it never saw created; and a single
bucket has a documented events-per-second limit, so a large backfill can exceed it and have
events dropped or delayed. The *real* limit people hit is downstream, not in S3: every
event can fan out to a Lambda, and Lambda's **reserved concurrency** caps how many
invocations run in parallel. Set it to 1 for a slow handler and you have built a queue
that processes one item at a time with a service that looks scalable on a diagram. If you
need ordering, exactly-once semantics, retries with backoff, or a dead-letter queue, use
SQS — and if you need the *stream*, use Kinesis, not S3 events.

> **PRODUCTION SCENARIO**
>
> Problem: a media pipeline writes thumbnails and triggers downstream processing from
> `ObjectCreated` events. After a bulk backfill of 2 million objects, the "processing
> backlog" dashboard showed 1.4 million items pending for nine hours, with no errors.
> Investigation: S3 event delivery was healthy and within limits; the queue was not
> backing up because it was not receiving. Lambda's concurrent executions for the
> thumbnail function were pinned at a reserved concurrency of 20, and the handler took
> ~400 ms per image with a downstream call, so throughput was capped at roughly 50 items
> per second — about 4.3 million per day, which should have been enough, except the
> handler was making a per-invocation S3 `GET` for the same source object that was already
> in the event payload, doubling the requests and pushing the real rate lower.
> Root cause: the concurrency limit and the redundant I/O together capped throughput well
> below the enqueue rate. The architecture was a synchronous fan-out with an invisible
> serialisation point, not an asynchronous pipeline.
> Solution: separate enqueue from processing — S3 event to SQS, an autoscaling worker fleet
> reading SQS with visibility timeouts, and a dead-letter queue for poison items. The
> redundant `GET` was removed because the object key and size are in the event.
> Prevention: alert on *queue age* rather than queue depth, because depth alone does not
> reveal a concurrency-capped consumer; and put a throughput budget on every
> event-triggered Lambda as part of the design review, not as a production surprise.

### 5.4 The Summary Table of Ways to Misuse S3

| Anti-pattern | What actually happens | The fix |
| --- | --- | --- |
| Querying by `LIST`-ing a prefix | 1,000 keys per request, billed per 1,000, sequential — cost scales with total objects | an index: DynamoDB, Postgres, or Elasticsearch |
| One JSON per entity, filtered client-side | full keyspace scan per query; non-atomic aggregates | relational table; S3 for the payloads |
| Per-object small writes | N requests, N round trips, partial failure | S3 Batch Operations, or bundle |
| Key-as-lock, key-as-counter | last-writer-wins; no conditional update in the base API | Redis/DynamoDB/Postgres with a real conditional write |
| S3 events as a message bus | at-least-once, unordered, no DLQ, Lambda concurrency caps throughput | SQS, or Kinesis for ordered streams |
| `GET` as a query on a 10 GB object | you pay to transfer the whole object to read 200 bytes | a real store, or a companion metadata index |
| User uploads to a writable prefix | stored XSS; arbitrary overwrite; no recoverability without versioning | isolated bucket + domain, fixed content type, versioning on |
| Long-lived presigned URLs | bearer tokens, credential-bound expiry surprises | minutes-long expiry, server-side re-signing |

> **MUST REMEMBER**
>
> S3 is bad at exactly two things — enumeration and mutation — and both are consequences of
> the same design that makes it good at everything else. It has no query layer and no
> conditional update, so any design that needs "find all of X" or "change this only if it is
> still Y" is paying to build a primitive the service will not give it, in application code,
> forever.

#### Common Mistakes

- Saying S3 "has folders" while explaining an anti-pattern that depends on prefixes — the
  two positions cannot both be held
- Quoting the pre-2020 eventual-consistency answer in the same breath as a modern
  architecture diagram
- Assuming `LIST` is free or unmetered because the console makes it look like a directory
  browser
- Believing two `PUT`s to the same key are ordered or that a `PUT` fails if the key exists
- Treating S3 event notifications as exactly-once or ordered, and assuming an async pipeline
  scales because S3 does
- Underestimating the abandoned-multipart cost, which is invisible in a normal listing

#### Interview Questions — Anti-Patterns

**Q1. A team stores 10 million JSON documents in S3, one per entity, and queries them by
listing a prefix. Walk me through why this degrades, with numbers.** `ADVANCED`

Because `ListObjectsV2` returns at most 1,000 keys per response, so one query over a
10-million-object prefix is 10,000 sequential paginated requests, each carrying a
continuation token, and each billed as a `LIST` per 1,000 keys returned. Cost and latency
therefore scale with the total number of objects in the bucket rather than with the number
of matching rows — the opposite of a database, where a query costs what it returns times an
index. Worse, the pagination is not a contiguous range unless the key layout makes it one:
if keys are `invoices/<uuid>.json` then the six documents for one customer are scattered
across the whole keyspace and it is a genuine full scan. It is also non-atomic — the
documents that constitute one aggregate are ten independent keys with no transaction and no
conditional update, so a partial write is a state the application has to define. The
correct answer is a real index: DynamoDB if the access patterns are known and few,
PostgreSQL if they are ad-hoc, Elasticsearch for search — with S3 holding the payloads the
rows point at, which is the shape nearly every correct S3 architecture has anyway.

**Q2. We need a mutex across four services. Can we use an S3 key?** `ADVANCED`

No, and the reason is mechanical rather than stylistic. S3 documents that it does not
support object locking for concurrent writers, and two simultaneous `PUT`s to one key
resolve last-writer-wins with no error. So `bucket/locks/order-42` does not exclude
anyone: both services "acquire" it, and the second write silently destroys the first one's
claim. There is no `If-Unmodified-Since` compare-and-swap in the base API, and the
conditional-write support that does exist — `If-None-Match: *` on `PutObject` — is a
create-if-absent primitive, not a lease, so you still have to solve expiry, renewal and
crash-recovery. Use a store that has conditional writes with a TTL: Redis `SET NX PX`,
a DynamoDB conditional put, or a database row — and then you own the lease-expiry problem,
which is the part that actually needs engineering.

**Q3. S3 event notifications to Lambda. Why does the pipeline stall at 50 items/second
when the bucket is taking 5,000 events/second?** `STAFF`

Because the fan-out is synchronous and the limit is not in S3. S3 delivers events
at-least-once, unordered, and within its own events-per-second ceiling per bucket, but the
real ceiling is Lambda's **reserved concurrency** on the consumer. If that is set to 20 and
the handler takes 400 ms, throughput is arithmetically capped at 50 per second, and no
amount of S3 capacity changes it. Two secondary problems make it worse: a handler that
re-fetches the object from S3 even though the key and size are in the event doubles the
request count and the latency; and because duplicates are routine, a non-idempotent handler
does work twice under exactly the conditions where you can least afford it. The correct
architecture is S3 event → SQS → an autoscaling worker fleet with visibility timeouts and a
dead-letter queue, so the enqueue is cheap and the processing rate is a scaling knob. If
you need ordering, go to Kinesis, because S3 events do not promise it.

**Q4. When is S3 the right place for a piece of data, and when is it categorically wrong?**
`STAFF`

Right when the object is immutable, write-once, large or awkward as a row, and retrieved by
exact key or by a well-known prefix — media and originals, backups, data-lake partitions,
model artefacts, audit objects under a retention policy. The economics are decisive there:
eleven nines, multi-AZ redundancy, and it is effectively free to put data in, which is why
backup-to-S3 is almost always worth doing. Wrong when you need to find objects by an
attribute, update one field of an entity, count, join, or maintain a relationship — because
all four require an index or a mutation primitive S3 does not have, and you would be
building them in application code over a billed, paginated scan. The sharpest version of
the answer: the test is whether you know the key. If you do, S3. If you know some of the
key's attributes, you want a store with an index, and the S3 bucket should be a dependency
of that store rather than a replacement for it.

**Q5. We want the cheapest possible home for a large archive that we will definitely never
read. What would you actually do?** `STAFF`

`DEEP_ARCHIVE`, with three things checked first. First, the 180-day minimum storage
duration and the pro-rated early-delete charge — an archive whose retention is shorter than
the minimum is paying for a discount it never earns, and the arithmetic can make
`GLACIER` cheaper overall. Second, the retrieval profile: Deep Archive restores take hours
and need a `RestoreObject` plus a completion callback, so any path that touches it must be
built as asynchronous from the start, not retrofitted after someone needs a file. Third,
and most often forgotten, **you do not yet know the access pattern**, which is the actual
condition under which `INTELLIGENT_TIERING` is the better answer: it has no per-GB
retrieval fee and it retiers automatically, so it is correct for the "we think this is cold"
case where you are guessing. I would also add a lifecycle rule to expire
noncurrent versions, because a versioned archive that nobody expires is a storage bill that
grew quietly while everybody was congratulating the team on cost work.

#### Further Reading

- [Amazon S3 — List of Amazon S3 APIs](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html) — the `MaxKeys` ceiling of 1,000 and the continuation-token contract.
- [Amazon S3 — S3 Batch Operations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/batch-ops.html) — bulk `Copy`, Lambda-invoke and `Restore` from a single API request over millions of objects.
- [Amazon S3 — Amazon S3 event notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html) — at-least-once delivery, duplicate handling, and the ordering caveat.
- [Amazon S3 — S3 pricing](https://aws.amazon.com/s3/pricing/) — request rates per class and the data-transfer line, for costing a `LIST`-heavy workload.

> **CHAPTER 5 SUMMARY**
>
> Every S3 anti-pattern is either using a linear, paginated, billed scan as a query, or
> re-implementing a primitive the service deliberately omits. `LIST` returns 1,000 keys per
> request and is charged per 1,000 keys returned, so a query cost scales with the size of
> the bucket rather than the size of the answer; a key-as-mutex fails because concurrent
> writes are last-writer-wins with no object lock; and an S3-events-to-Lambda pipeline
> stalls at whatever reserved concurrency allows, with at-least-once delivery and no
> ordering on top. The test that settles most of these is short: if you know the key, S3 is
> the right store, and if you know only some of the key's attributes you need an index —
> which means DynamoDB, PostgreSQL, or Elasticsearch, with the bucket holding the payloads
> those stores point at. The last number to carry is 1,000 keys per `LIST` page, because
> every number in this chapter follows from it.

## Chapter 6 — Elasticsearch: The Inverted Index

### 6.1 The One Structure That Makes It a Search Engine

Elasticsearch is a distributed search engine built around a data structure that is about
forty years old and is still the right answer: an **inverted index**. The forward index
maps a document to its terms. The inverted index maps each term to the list of documents
containing it. That inversion is the whole reason a query for `wireless headphones` costs
milliseconds over a billion documents instead of a linear scan.

```text
  THE INVERSION
  ─────────────
  FORWARD (how the document is stored — a human reading a doc)
  doc 1: "the quick brown fox jumps over the lazy dog"
  doc 2: "a quick brown dog outpaces a fox"
  doc 3: "the dog barks at the fox"

  INVERTED (how the search engine stores it — term → postings)
  ┌──────────────┬───────────────────────────────────────┐
  │ TERM         │ POSTINGS (doc IDs, ordered)           │
  ├──────────────┼───────────────────────────────────────┤
  │ brown        │ [1, 2]                                 │
  │ dog          │ [1, 2, 3]     ← term frequency        │
  │ fox          │ [1, 2, 3]     ← doc frequency = 3     │
  │ jumps        │ [1]                                 │
  │ lazy         │ [1]                                 │
  │ outpaces     │ [2]                                 │
  │ quick        │ [1, 2]                               │
  │ the          │ [1, 3]     ← highest df, lowest IDF   │
  ├──────────────┼───────────────────────────────────────┤
  │ (terms dict) │  ← sorted, deduplicated, one entry    │
  │              │    per distinct term in the whole     │
  │              │    segment, loadable into memory      │
  └──────────────┴───────────────────────────────────────┘

  "fox" → read the postings list [1,2,3] → done. No document is read.
```

Two properties follow, and they are the reason the structure works:

- **Lookup is a dictionary probe, not a scan.** The terms dictionary maps a term to its
  postings list, and that dictionary is loaded in memory. A query is a set of dictionary
  probes plus a set intersection.
- **Postings lists are sorted, so conjunction is a merge.** Finding documents containing
  both `dog` and `fox` is a linear walk of two sorted lists, which is why Elasticsearch can
  execute `must: [dog, fox]` without touching a document.

### 6.2 The Pipeline: Text Becomes Terms

Analysis is the step that turns a string into the keys of the dictionary, and it is a
**three-stage chain**. This is Chapter 7's subject in detail, but the structure has to be
right here because it determines what is in the postings lists at all.

```text
  TEXT →  TOKENIZE  →  NORMALIZE/FILTER  →  TERMS  →  POSTINGS
   "Running quickly to the café"
        │
        ▼  char filters (e.g. strip HTML, map é→e)
   "Running quickly to the cafe"
        │
        ▼  tokenizer (standard: splits on Unicode text boundaries)
   ["Running", "quickly", "to", "the", "café"]
        │
        ▼  token filters (lowercase, stop-words, stemming, n-grams)
   ["run", "quick", "cafe"]          ← stop words dropped, stemmed
        │
        ▼  these three are the KEYS in the terms dictionary
   run     → [doc 7, doc 19, doc 402, ...]
   quick   → [doc 7, doc 88, ...]
   cafe    → [doc 402, ...]
```

The critical fact — and the one that causes real reindex work — is that **the same chain
runs at index time and at query time, and the index-time chain is what populated the
dictionary.** If the index-time analyser stemmed and the query-time analyser did not, the
query for `run` looks for the term `run` in a dictionary whose keys are `run`, `quick`,
`cafe` — which works by accident here, but the reverse case (index does not stem, query
stems) returns nothing at all. This asymmetry is silent: the query returns fewer results
rather than raising an error.

### 6.3 The Field-Level Anatomy: Where the Data Actually Lives

This is the material that separates someone who has used Elasticsearch from someone who
can reason about its memory. There are **three** places a field's value lives, they have
different costs, and confusing them is the source of most "Elasticsearch is using too much
heap" incidents.

```text
  THREE PLACES A FIELD'S DATA LIVES
  ─────────────────────────────────

  1. _source  — the ORIGINAL JSON, stored per document, compressed.
               • What you get back in the response by default.
               • Reindexable source of truth for re-processing.
               • Cost: usually the LARGEST thing in the index. A 5 kB
                 document has a _source around 5 kB compressed, while
                 the postings for that document might be a few hundred
                 bytes. _source routinely dominates index size, often
                 by an order of magnitude.
               • Disabling it saves a lot and costs you reindex-only
                 workflows and painless-script access.

  2. INVERTED INDEX (postings) — term → doc IDs, per field.
               • Enables text search, term matching, relevance.
               • Analyzable, so stemming/stop-words apply.
               • Not sortable, not aggregatable directly.

  3. doc_values — a COLUMNAR, ON-DISK copy of each field's values,
               one column per field, one row per document.
               • Built at index time, off the heap.
               • Powers sorting, aggregations, and script access.
               • Does NOT preserve array order, and may drop duplicates
                 and nulls — it is a column of values, not JSON.
               • NOT queryable as text: you cannot "search" the
                 doc_values structure, and you cannot analyze it.
                 (A field with index:false and doc_values:true can
                 still be matched exactly via term queries, but it is
                 unanalyzed and exact-only.)
               • You can disable it per field, and you should, when
                 the field is never sorted, aggregated or scripted.

  PLUS: stored fields — the original value stored in the Lucene
  document, fetched during retrieval. Mostly a legacy of pre-6.0
  retrievers; _source largely replaced them. Relevant to know they
  exist; not usually worth using.
```

> **INTERVIEW TRAP — "WHY IS MY INDEX 20× BIGGER THAN MY SOURCE DATA?"**
>
> Three answers, in the order to check them. (1) **`_source` dominates.** It holds the
> original JSON verbatim, and for documents that are mostly prose, the compressed postings
> are a small fraction of the size. Ten million 5 kB documents is ~50 GB of `_source` before
> anything else. (2) **Analyzers explode the postings.** Indexing a `text` field with an
> `ngram` or `edge_ngram` analyzer, or shingle filters for phrase search, creates a posting
> for every n-gram, and the term count per document goes from ~100 to ~1,000+. (3)
> **Dynamic mapping explosion** — every distinct JSON key became a field, and each field
> carries its own dictionary, its own postings, its own `doc_values`, and its own norms.
> That is Chapter 7's and Chapter 8's subject, and it is the one that is cheapest to
> diagnose with `GET index/_mapping?pretty` and `_field_stats`.
>
> The genuinely counter-intuitive part worth saying: **`doc_values` doubles the value
> storage for a field**, because it is a second copy of the field's data, column-oriented. So
> a field that is indexed as `text` *and* has a `.keyword` sub-field costs you three
> structures — the analyzed postings, the exact-term postings of the keyword, and the
> keyword's `doc_values` — for one logical field. That is the price of the multi-field
> pattern, and it is usually worth paying, but you should be able to say what it is.

### 6.4 Term Frequency, Document Frequency, Norms, and Why Scores Are Comparable

Four small things that live in the postings and explain the whole scoring model.

```text
  term frequency (tf)   how many times the term appears IN THIS DOCUMENT
                        stored in the postings as a per-doc frequency

  document frequency    how many documents contain the term
  (df)                  computable from the postings list length;
                        drives IDF (inverse document frequency)

  norms                 a per-document, per-field length normalisation
  ───────               value, stored as a single byte, encoding how
                        long the field was. A long field penalises
                        per-term scores so that a match in a 10-word
                        title counts for more than a match in a
                        5,000-word body. This is BM25's "b".

  _source               the original JSON — a different thing entirely,
                        not part of scoring.
```

That is enough to state BM25's shape and why it works, which is the level of detail an
interview needs. BM25 scores a document by summing, over the query terms, a term's
contribution:

```text
  score(D, Q) = Σ  IDF(q) · ( tf(q,D) · (k1 + 1) )
                        ─────────────────────────────
                        tf(q,D) + k1 · ( 1 - b + b · |D|/avgdl )

  k1  term-frequency saturation. Default 1.2. Controls how quickly
       repeating a term stops helping. Without it, a document saying
       "dog" 500 times would beat a document saying it once and
       covering the topic properly. k1 makes the 2nd occurrence worth
       almost as much as the 1st and the 20th worth barely more than
       the 2nd.
  b   length normalisation. Default 0.75. Controls how much field
       length is punished. b=0 means length is ignored entirely;
       b=1 means full normalisation.
  IDF how rare the term is corpus-wide. A term in every document
       ("the") contributes almost nothing; a rare term contributes
       a lot.
```

The one nuance that matters in a real interview: **BM25 is computed per shard.** Scores
are not globally comparable across shards, which is why Elasticsearch's distributed search
uses the `dfs_query_then_fetch` search type (two-phase: gather term statistics across all
shards, then fetch with global statistics) when you need exact scoring across a large
index — at the cost of an extra round trip. The default is `query_then_fetch`, which is
faster and slightly less accurate because each shard scores against its own local term
statistics. "It returns different results depending on shard count" is a real
Elasticsearch phenomenon, and being able to attribute it to per-shard IDF is the staff-level
answer.

### 6.5 Segments, Merges, and Why Your Index Shrinks Overnight

The index is a sequence of immutable **Lucene segments**, and the behaviour of the engine
falls out of that.

```text
  THE SEGMENT LIFECYCLE
  ─────────────────────
  WRITE  ──▶ new segment (in-memory buffer, the "refresh" boundary)
              │  segment is IMMUTABLE. A new segment is created for
              │  new writes; existing ones are never modified.
              ▼
  refresh (default every 1s) ──▶ segment becomes searchable (near-real-time)
              │
              ▼
  flush   ──▶ segment written to disk, fsynced, a new commit point
              │  (the translog is what covers durability between flushes)
              ▼
  merge   ──▶ several small segments → one larger segment
              │  • deleted docs are DROPPED (this is when disk is
              │    reclaimed)
              │  • deleted terms are purged from the dictionary
              │  • costs I/O and CPU; runs in the background
              ▼
  fewer, larger segments → better search performance

  CONSEQUENCE: DELETE DOESN'T FREE SPACE IMMEDIATELY.
  A delete marks a document as deleted in a small segment. The bytes
  are freed at the next merge. This is why a daily index that is
  deleted wholesale must be DELETED (drop the index), not cleared
  document by document — deleting every doc still leaves the segments
  on disk until a merge catches up.
```

This is also the answer to "why did my index get slower and then faster with no change in
data": segment count, not data volume, drives search cost, and merges are the mechanism
that reduces it. And it connects to the refresh interval, which is Chapter 8's subject but
belongs in the picture: refresh is what makes a segment *searchable*, flush is what makes
it *durable*, and the gap between them is the translog's job.

> **SCALING REALITY CHECK**
>
> The heap rule that governs all of this: **keep the node heap at or below the ~31 GB
> compressed-oops limit**, and treat the heap as *cache* for the segment data, not as
> storage. Elasticsearch's own sizing guidance targets roughly **10–50 GB per shard** and
> advises keeping shards under about 200 million documents, with shard count chosen per
> workload and validated by testing rather than by a formula. The failure mode to know: too
> many small shards (hundreds of 2 GB shards) means every query fans out to hundreds of
> shards, every merge has small inputs, and the master is coordinating constantly. Too few
> large shards means a single shard exceeding heap on any node, and rebalancing a 2 TB
> shard means moving 2 TB. The number to carry is not "how big should a shard be" but
> "how big is one shard relative to the heap of a node", because that ratio is what
> determines whether a query can be answered from memory.

#### Common Mistakes

- Describing Elasticsearch as storing documents and searching them, without the inversion
- Confusing the terms dictionary, the postings, `_source` and `doc_values` as one thing
  rather than as four structures with four cost profiles
- Believing `doc_values` can be text-searched — it is an unanalyzed columnar copy, and the
  only reason it exists is sorting, aggregation and scripting
- Treating refresh and flush as the same event, and then being unable to explain
  near-real-time search
- Expecting a delete to free disk immediately
- Claiming BM25 scores are globally consistent across an index
- Sizing shards by a formula rather than by measured heap behaviour

#### Interview Questions — The Inverted Index

**Q1. Explain the inverted index and why it makes search fast.** `TRICKY`

A forward index maps each document to the terms it contains. Elasticsearch inverts that: it
maintains a sorted, deduplicated dictionary of every distinct term in the segment, and each
term maps to a sorted postings list of the documents containing it. A query becomes a
dictionary probe — O(log n) in the dictionary, effectively O(1) because the dictionary is
held in memory — plus a merge over the postings lists. Because postings are sorted by
document ID, a conjunction of two terms is a linear merge of two sorted lists, so
`must: [dog, fox]` never reads a document to decide whether it matches. That is the whole
mechanism, and it is why the cost of a search is proportional to the postings it must
traverse rather than to the corpus size. The cost of the structure is at write time: every
distinct term in every document is an entry, which is what drives index size and merge
cost.

**Q2. Where does a field's data live in Elasticsearch, and what does each structure cost?**
`ADVANCED`

Three places, and conflating them is the source of most memory incidents. `_source` is the
original JSON per document, compressed, returned by default in results and the only thing
you can reindex from; it is typically the largest single component of index size, often
dominating postings by an order of magnitude for prose documents. The inverted index holds
the analyzed postings — term to document — and is what makes text search and relevance
possible, but it cannot sort or aggregate. `doc_values` is a columnar, on-disk, off-heap
copy of each field's values, one column per field, built at index time, and it is what
powers sorting, aggregations and script access. `doc_values` is a column of values, not
JSON: it does not preserve array order and may drop duplicates and nulls, it is not
analyzed so it cannot be text-searched, and it can be disabled per field. Stored fields
also exist as a legacy mechanism but `_source` largely replaced them. The practical
consequence is that a `text` field with a `.keyword` sub-field costs three structures for
one logical field, and being able to say that is the difference between tuning an index
and guessing at it.

**Q3. What is the translog, and how does it relate to refresh?** `ADVANCED`

Two different durability/visibility mechanisms that people conflate. **Refresh** is what
makes an indexed document *searchable*: the in-memory buffer becomes a new immutable
segment, and newly indexed documents become visible to search. It happens on a timer,
default once per second, and that interval is the source of near-real-time search — a
document is not searchable the instant you index it. **Flush** is what makes it
*durable*: the segment is written to disk and fsynced, creating a commit point. The gap
between refresh and flush is covered by the **translog**, an append-only log of every
operation since the last commit, which is replayed at startup to recover anything indexed
but not yet flushed. The durability trade is therefore explicit: you can raise the flush
interval to reduce fsync overhead and accept a larger translog and a longer recovery, or
you can call `?refresh=wait_for` when you need a document to be searchable immediately
after indexing, paying latency for a synchronous refresh.

**Q4. Your index doubles in size, then halves overnight. Explain.** `TRICKY`

Segments, and merges. Indexing appends new immutable segments rather than modifying
existing ones, so a segment accumulates new documents, updates (as delete-then-add
internally) and deletions as separate structures. Segment count drives both search cost
and disk use, so Elasticsearch merges small segments into larger ones in the background;
a merge **drops deleted documents** and purges deleted terms from the dictionary, which is
when the disk is actually reclaimed. If your workload is a daily index that you clear with
a `delete by query` rather than by dropping the index, the deleted documents are marked
deleted but the segments keep their bytes until a merge runs, so the index looks full for
hours. The fix is to drop daily indices by name — cheap, immediate, and it is why
time-series indices are index-per-day rather than one index with a timestamp filter.

**Q5. Are BM25 scores comparable across shards?** `ADVANCED`

Not by default, and this is a real and observable phenomenon rather than a rounding
detail. BM25's inverse-document-frequency term depends on corpus-wide term statistics, but
in a distributed search each shard computes those statistics over its own local documents,
because gathering global statistics would require a first pass over every shard. The
default search type is `query_then_fetch`: every shard runs the query and scores locally,
then the coordinating node merges. A document's score therefore depends on which shard it
landed on, and the same query against differently-sized indexes can return differently-
ordered results. When exact global scoring matters, `dfs_query_then_fetch` gathers term
statistics across all shards in a first round trip and then fetches with global IDF,
which costs an extra round trip and is why it is not the default. The staff-level addition
is that this is a consequence of distribution, not a bug, and the practical defence is
`function_score` or an explicit sort on a business field when you need a stable, explainable
ordering rather than a relevance score.

**Q6. How do you decide how many shards an index should have?** `STAFF`

Not by a formula, and the honest answer starts by saying what the shard count controls: it
is the unit of parallelism for search, the unit of the unit of recovery, the unit that
rebalances across nodes, and the unit that must fit in a node's heap. Elasticsearch's
current guidance is roughly 10–50 GB per shard and under about 200 million documents per
shard, with the shard count chosen per workload and validated by benchmarking rather than
by dividing a data estimate by a target size. The two failure modes to name are symmetric:
too many small shards means every query fans out to hundreds of shards, every merge
operates on small inputs, and cluster state and the master node get stressed; too few
large shards means one shard can exceed a node's heap, and rebalancing or relocating a
multi-terabyte shard is a long, expensive operation. The check that beats a formula is
empirical: measure query latency at your target shard count on a production-shaped index,
and remember that adding shards later requires a reindex, whereas the number you start
with is roughly the number you are stuck with.

#### Further Reading

- [Elasticsearch — The inverted index](https://www.elastic.co/guide/en/elasticsearch/reference/current/term-level-queries.html) — how terms, dictionaries and postings are queried at the Lucene level.
- [Elasticsearch — doc_values](https://www.elastic.co/guide/en/elasticsearch/reference/current/doc-values.html) — what they are, why they are columnar and on-disk, and exactly what they lose relative to `_source`.
- [Elasticsearch — Near real-time search](https://www.elastic.co/guide/en/elasticsearch/reference/current/near-real-time-search.html) — refresh, the `refresh_interval`, and `?refresh=wait_for`.
- [Elasticsearch — How documents are stored](https://www.elastic.co/guide/en/elasticsearch/reference/current/documents.html) — segments, merges, and why deleted bytes are freed only at merge.

> **CHAPTER 6 SUMMARY**
>
> Elasticsearch is a distributed engine around a 1970s data structure: an inverted index
> pairing a memory-resident sorted terms dictionary with per-term sorted postings lists,
> which turns a search into dictionary probes and list merges rather than a scan. The
> structure that makes it fast is what makes it expensive to write, and it is the second
> piece of anatomy people get wrong — a field's data lives in up to three places with
> three cost profiles: `_source` (the original JSON, usually the largest thing in the
> index), the analyzed postings (search only), and `doc_values` (columnar, off-heap,
> unanalyzed, powering sort/agg/script and not text-searchable). Scoring is BM25 with
> term-frequency saturation (`k1 = 1.2`) and length normalisation (`b = 0.75`, stored as
> per-field norms) — and because IDF is computed per shard, scores are not globally
> comparable unless you pay for `dfs_query_then_fetch`. Write into immutable segments and
> let merges reclaim deleted space, which is why dropping a daily index beats clearing it.

## Chapter 7 — Elasticsearch: Mapping, Analyzers & Relevance

### 7.1 The Analysis Chain, Twice

The chain from Chapter 6, now in detail, because the map stage is where the two most
expensive mistakes in Elasticsearch live.

```text
  CHARACTER FILTERS      transform the raw string before tokenizing
  ─────────────────      e.g. html_strip, mapping (é → e), icu_folding
         │
         ▼
  TOKENIZER              splits text into tokens
  ───────────            • standard   — Unicode text boundaries
                         • whitespace — splits on whitespace only
                         • keyword    — the ENTIRE string as one token
                         • ngram / edge_ngram — sliding windows
                         • pattern    — regex / email / path
         │
         ▼
  TOKEN FILTERS          transform each token
  ─────────────          • lowercase, asciifolding
                         • stop        — remove "the", "and"
                         • stemmer     — "running" → "run"
                         • synonym_graph
                         • ngram       — add bigrams for phrase search
         │
         ▼
  TERMS  →  dictionary keys  →  postings
```

**This chain runs twice, and the two runs are the design.** At index time, it produces the
terms in the dictionary. At query time, it produces the terms you are looking up. They must
agree or you get silently wrong results.

```text
  INDEX TIME                          QUERY TIME
  ──────────                          ──────────
  "The Running Dogs"                   search: "Running Dogs"
  standard → [The, Running, Dogs]      standard → [Running, Dogs]
  lowercase → [the, running, dogs]    lowercase → [running, dogs]
  stop →     [running, dogs]           stop →     [running, dogs]
  stemmer →  [run, dog]                (no stemmer)
                                       → looking for "running","dogs"
                                       → in a dictionary of "run","dog"
                                       → ZERO HITS. No error. No warning.
```

The fix is a reindex, and that is why the analysis configuration is treated as part of the
schema. Changing an analyser — adding a synonym, switching from `standard` to `english`,
enabling a stemmer, changing the stop list — invalidates every posting in every shard of
that field. There is no in-place update. Volume 4's mental model applies directly: this is
an index on your data, and changing an index's structure means rebuilding it.

> **MUST REMEMBER**
>
> The analysis chain is part of the schema, not a runtime configuration. An index-time
> analyser that differs from the query-time one produces **fewer results, not an error**,
> and the only safe way to change it is a reindex with an alias swap. Every synonym list,
> stemmer and stop-word set you choose is a decision you will pay a full rebuild to change.

### 7.2 `text` vs `keyword`, and Why a Field Is Usually Both

The single most consequential mapping decision, and the one that most often goes wrong in
one direction or the other.

```text
  keyword  the whole field value is ONE token, unanalyzed
           • exact match only:  {"term": { "status": "SHIPPED" }}
           • sortable (has doc_values)
           • aggregatable (buckets: "SHIPPED": 4,201, "PENDING": 88)
           • case-SENSITIVE, whitespace-sensitive
           • 32766-byte limit on a single term in Lucene

  text     analyzed into terms
           • full-text match: {"match": { "title": "quick brown" }}
           • NOT sortable, NOT aggregatable
           • lowercased, stemmed, stop-worded by default (standard analyzer)

  THE DEFAULT THAT BITES
  ──────────────────────
  Dynamic mapping maps a STRING to:
      text   + .keyword sub-field
  So {"match": {"status":"shipped"}}  → 0 hits   (analyzed: "shipped"
                                             vs indexed "SHIPPED")
      {"term":  {"status":"SHIPPED"}}  → 1 hit    (keyword: exact)
      status.keyword in an aggregation  → works

  THE CORRECT SHAPE FOR A FIELD YOU BOTH SEARCH AND AGGREGATE
  ─────────────────────────────────────────────────────────────
  "status": {
    "type": "text",
    "analyzer": "standard",              ← search on this
    "fields": {
      "keyword": { "type": "keyword" }   ← exact filters, sorts, aggs
    }
  }
  → match:   status:(shipped)     ← full-text
  → term:    status.keyword: SHIPPED   ← exact
  → aggs:    terms on status.keyword
  The cost: three structures for one field (text postings, keyword
  postings, keyword doc_values). Usually worth it. Declare it
  explicitly rather than relying on the dynamic default, so the
  intent is in the mapping and not in a guess about what dynamic
  mapping will do.
```

The `text`-only failure is the embarrassing one: a team indexes a `status` field, writes a
`term` query with the wrong case, gets zero results, and spends a day debugging the query
instead of the mapping. The `keyword`-only failure is the expensive one: a team maps a
`description` as `keyword`, so a `match` query finds the whole 500-character description as
one term and no search ever matches, and the mapping change requires a reindex of the whole
index.

Also worth knowing: `keyword` fields are case-sensitive by default because they are
unanalyzed. If you want case-insensitive exact matching, the answer is a `normalizer` at
index time plus a matching one at query time (or a `match` query against the analysed
parent, which is the more common solution).

### 7.3 Dynamic Mapping, and the Explosion

Dynamic mapping is convenient until it isn't, and the failure is a specific and memorable
one: **a new JSON key in one document creates a new field, in every shard, forever.**

```text
  THE EXPLOSION
  ─────────────
  Documents arrive from a partner integration. Each carries a
  per-transaction `attributes` object whose keys are dynamic:

  doc 1:  {"attributes": {"campaign_id": "c1"}}
  doc 2:  {"attributes": {"coupon":    "SPRING"}}
  doc 3:  {"attributes": {"affiliate": "bob"}}
  ...
  doc 50,000: {"attributes": {"partner_ref_49382": "x"}}

  Dynamic mapping creates a NEW FIELD for each distinct key.
  A field is not a row — a field has its own dictionary segment,
  its own postings, its own doc_values column, its own norms,
  its own entry in the mapping, and it is tracked per shard.

  Result: the index "has 50,000 fields". Cluster state bloats,
  mapping serialization slows every request that touches the
  mapping, heap pressure rises, and no single query is obviously
  at fault. Worse: fields are never removed by deleting their
  documents.

  THE FIXES
  ─────────
  1. dynamic: false on the object — unmapped fields are stored in
     _source but NOT indexed. (Stored, invisible to search. Cheapest.)
  2. dynamic: strict — indexing that document fails with a clear
     400 mapper_parsing_exception. Harsh, but loud. Best when a
     schema mistake must never be silent.
  3. dynamic templates — map anything under attributes.* to a
     keyword with ignore_above, or as a flattened field.
  4. flattened — a whole sub-object as ONE field, no per-key
     fields. The right answer for genuinely arbitrary key-value
     data.
```

> **INTERVIEW TRAP — "ELASTICSEARCH SILENTLY IGNORES A FIELD I KNOW IS IN THE DOCUMENT"**
>
> The single most common Elasticsearch debugging session, and it is silent by design. A
> query against a field that is not in the mapping does not error; it returns no matches. The
> document is fine — `GET index/_doc/1` shows the field in `_source` — but it was never
> indexed, because it was never mapped. This happens for: a `dynamic: false` sub-object, a
> field whose name differs only in case, a field added to the mapping after documents were
> already indexed (the mapping change is not retroactive — old documents do not gain the
> field), or a field nested under a dynamic path that got typed as something incompatible.
>
> The debugging move worth naming: `GET index/_mapping/field_name` to confirm the field
> exists, and `GET index/_search` with `"explain": true` or a `match_all` to see whether
> any document has it. The design move is to make schema violations loud — `dynamic:
> strict` at the root for a document whose shape is under your control, `flattened` for
> arbitrary key-value data, and templates for the middle. Elasticsearch is a search engine
> over documents you do not fully control, so "the schema is discovered from the data" is
> often right — but only if you have decided that, rather than discovering it after the
> field count has reached 50,000.

### 7.4 Relevance: `query` vs `filter` Context

The `bool` query is where most real Elasticsearch queries live, and the one distinction
inside it has a large, mechanical performance consequence.

```text
  bool query clauses
  ──────────────────
  {
    "query": {
      "bool": {
        "must":     [ ... ],   ← scored, contributes to _score, sorted by
        "should":   [ ... ],   ← scored; optional (min_should_match)
        "filter":   [ ... ],   ← NOT scored, cached, orderable
        "must_not": [ ... ]    ← NOT scored, cached, excluded
      }
    }
  }

  WHY filter IS CHEAPER
  ─────────────────────
  • must/should contribute to _score → they must compute term
    statistics (tf, df, norms) → real CPU per clause
  • filter clauses are pure predicates → no scoring work
  • filter clauses are CACHED: identical filter queries are
    reused across requests, and Elasticsearch caches the *set of
    documents that match* for repeated filters (the "filter cache"),
    which turns a repeated filter into a bitset lookup
  • the cache requires that _score not be affected → this is why
    you must use filter for anything that is a hard constraint

  THE RULE
  ────────
  "Does this document have to match?"        → filter
  "How well does this document match?"       → must / should

  Everything in a filter that could be in a must and does not
  affect relevance belongs in the filter. Typical real query:
  must:    [ match(title, "wireless headphones") ]   ← the user's words
  filter:  [ term(status.keyword, "in_stock"),
             range(price, {gte, lte}),
             term(category.keyword, "electronics") ] ← constraints
  The filter clauses are also the ones that can be cached across
  users, and they are the ones you can put in a `terms` lookup
  against a small enum.
```

The tuning consequence that is worth stating unprompted: **relevance work is per-document
and per-clause, and it cannot be cached.** A query with five `should` clauses on large text
fields is doing real scoring work on every matching document, and that is why
`multi_match` over many `text` fields is one of the most expensive things you can ask for.
A query with five `filter` clauses is doing predicate evaluation, much of it cacheable.

#### Common Mistakes

- Changing an analyzer and expecting existing documents to change — it is a reindex
- Assuming an index-time and query-time mismatch produces an error rather than zero results
- Mapping a filterable/aggregatable field as `text` only, or a searchable field as
  `keyword` only
- Leaving `dynamic: true` on a sub-object with arbitrary keys and not watching the field
  count
- Assuming a query against an unmapped field is an error — it silently returns nothing
- Putting hard constraints in `must` instead of `filter` and paying scoring cost plus
  losing the filter cache
- Relying on the `standard` analyzer to stem English, and then being surprised that
  "running" does not match "run" without a `stemmer` token filter

#### Interview Questions — Mapping, Analyzers & Relevance

**Q1. When a `match` query returns nothing on a field you can see in `_source`, how do you
debug it?** `TRICKY`

Work through the four causes in order. First, is the field actually in the mapping —
`GET index/_mapping/field_name` — because a field in `_source` that is not mapped is
stored but not indexed, and a query against an unmapped field returns zero results with no
error. Second, the analysis: if the field is `text` with the `standard` analyzer, "The
Running Dogs" is indexed as `the running dogs` lowercased but *not* stemmed, so a query
token that stems — or a `match_phrase` on a stemmed form — misses; and if you have a
`stop` filter, "the" is not in the dictionary at all. Third, whether you are querying a
`text` field with a `term` query, which is exact and unanalyzed, so a lowercase query term
against an uppercase value is a miss. Fourth, whether the mapping changed after the
documents were indexed, because mapping changes are not retroactive. The debugging technique
worth naming is `"explain": true` on a matching document, which shows the per-shard
analysis of the query and the document, and the design fix is a reindex with an explicit
mapping.

**Q2. `text` vs `keyword`, and what happens if you pick the wrong one?** `ADVANCED`

`text` is analyzed into terms — lowercased, stemmed if you configure it, stop-worded if you
configure it — and supports full-text `match` queries but is neither sortable nor
aggregatable. `keyword` is the whole value as a single unanalyzed token: exact `term`
matching, sortable, aggregatable, and case-sensitive. Dynamic mapping gives a string both,
as `text` plus a `.keyword` sub-field, which is why `{"match":{"status":"shipped"}}` returns
nothing against an indexed `SHIPPED` while `{"term":{"status":"SHIPPED"}}` returns the row —
the analysed form is `shipped` and it never matched `SHIPPED`, but the keyword sub-field is
exact. Picking `keyword` for a prose field is the expensive error: the whole description is
one 500-character term that nothing matches, and the fix is a reindex. Picking `text` for
an enum is the embarrassing error: filters, sorts and aggregations either fail outright or
match wrongly by case. The correct default is to declare the mapping explicitly — `text`
with a `.keyword` sub-field for anything you both search and aggregate — rather than relying
on what dynamic mapping infers, because the inference is a guess and the intent is not
written down anywhere.

**Q3. What is dynamic mapping explosion, and what do you do about it?** `ADVANCED`

Dynamic mapping infers a field type from the first document that contains a field, and
creates it in the mapping. When documents carry arbitrary JSON keys — per-transaction
`attributes`, partner-specific payloads, a `metadata` bag — every distinct key becomes a
distinct *field*. A field in Elasticsearch is not a row: it has its own dictionary segment,
postings, `doc_values` column and norms, it is tracked per shard, it appears in the mapping
that is serialized on nearly every request, and deleting all the documents that used it does
not remove it. Fifty thousand dynamic keys produce fifty thousand fields and a slow,
memory-hungry index with no obvious culprit. The fixes depend on how much you know about
the shape. `dynamic: false` on the object stores the fields in `_source` without indexing
them — data is preserved, search is impossible, and it is the cheapest option. `dynamic:
strict` rejects the document with a `mapper_parsing_exception`, which is harsh but loud and
is the right setting for a shape you control. Dynamic templates catch known patterns, and
the `flattened` field type maps an entire sub-object as one field with no per-key
explosion, which is the correct answer for genuinely arbitrary key-value data.

**Q4. Why does changing an analyser require a reindex, and how do you do one safely?**
`ADVANCED`

Because the analysis chain's index-time output *is* the dictionary. The postings were built
by tokenizing each document with that specific chain, and the terms in the dictionary are
the result. Change the analyser — add a synonym, enable a stemmer, switch stop-words — and
the new chain produces different terms, so every existing posting is stale. There is no
in-place update to an index, exactly as with a column type change in a relational index
(Volume 4). The safe procedure is: create a new index with the updated mapping and an
alias pointing at the old one, dual-write or replay from the source of truth, `refresh` and
validate counts and a sample of queries, then atomically swap the alias and delete the old
index later. Two operational notes that are worth saying out loud: a reindex of a
large index is a full copy and takes hours, so the analysis configuration belongs in code
review as a schema change with a migration ticket, not as a runtime tweak; and because the
mismatch between index-time and query-time analysis is *silent* — the query returns fewer
results rather than erroring — the only safe way to change the chain is for both sides at
once, which a reindex gives you and a mapping PUT does not.

**Q5. When do you use `filter` instead of `must` in a `bool` query?** `TRICKY`

When the clause is a hard constraint rather than a relevance signal — status equals
`in_stock`, price in a range, category in a set, a tenant ID, a date range. The distinction
is mechanical, not stylistic: `must` and `should` clauses contribute to `_score`, so they
must compute term statistics and do real per-document work; `filter` and `must_not` clauses
are pure predicates, do not affect `_score`, and are eligible for the filter cache, which
reuses the set of matching documents across repeated identical filters. So the rule is "does
this document have to match?" → `filter`; "how well does this document match?" → `must` or
`should`. The realistic query is a `match` on the user's search terms in `must` and every
boolean constraint in `filter`, and the payoff is that the constraint set is the part most
likely to be repeated across requests, so it is the part that pays off in cache hits. The
mistake is symmetric and common: putting a `term` filter in `must` costs you scoring work
on every matching document and forfeits the cache for zero relevance benefit.

**Q6. Our index is 20× larger than the source data. Where do you look?** `ADVANCED`

In three places, cheapest first. (1) `GET index/_field_caps` or `_field_stats` to find
which fields dominate — `_source` is usually the largest single component, because it holds
the original JSON verbatim, and for prose-heavy documents the compressed postings are a
small fraction of it. (2) The mapping, for dynamic mapping explosion: an arbitrary
key-space under a sub-object produces one field per distinct key, each with its own
dictionary, postings, `doc_values` and norms. (3) The analyzers: an `ngram` or `edge_ngram`
analyzer, or shingle filters for phrase support, adds a posting for every n-gram, taking
term count per document from ~100 to ~1,000+ and inflating the dictionary accordingly.
After diagnosis, the remedies are ordered by cost: drop or disable `doc_values` on fields
that are never sorted, aggregated or scripted; shrink `_source` with `index: false` on
fields you do not need to reindex from, or use a source filter at index time; fix the
mapping for explosion with `dynamic: false`/`strict`/`flattened`; and only then consider
disabling `_source` entirely, which is a genuinely large saving and a genuinely hard
trade because it removes reindex-from-source and painless-script access.

**Q7. Our `match` query finds documents with the words but the top results are wrong. Where
do you start?** `STAFF`

Start by establishing whether the problem is the ranking or the candidate set, because they
have different causes. If the right documents are not in the results at all, it is a recall
problem: stop words, a `stemmer` or `synonym` asymmetry between index and query time, or
`text`/`keyword` confusion. If the right documents are in the result set but far down, it
is scoring. Then work through the levers in order of value: add `should` clauses or
`multi_match` boosts for the fields that should matter more, because field importance is
the most common cause of bad ranking; check that the fields you want to rank on are
actually `text` and analyzed, since a `keyword` field contributes nothing to a `match`;
use `boost` and `boosting` query rather than post-processing; and consider that the
default `query_then_fetch` scores per shard, so global IDF is not being applied, and
`dfs_query_then_fetch` or an explicit `function_score` will produce more stable, explainable
ordering. The interview point worth making is that relevance tuning is a product decision
with a technical mechanism, and the first thing to establish is which of the two problems
you have, because the fix for recall is never a boost.

#### Further Reading

- [Elasticsearch — Text analysis: the analyzer](https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-analyzers.html) — character filters, tokenizers, token filters, and how the chain is assembled.
- [Elasticsearch — Mapping field types: `text` and `keyword`](https://www.elastic.co/guide/en/elasticsearch/reference/current/keyword.html) — why a multi-field of both, and the 32766-byte keyword limit.
- [Elasticsearch — Dynamic field mapping](https://www.elastic.co/guide/en/elasticsearch/reference/current/dynamic-mapping.html) — `dynamic: true/false/strict`, dynamic templates, and the `flattened` type.
- [Elasticsearch — Search your data: filter and query contexts](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-bool-query.html) — the `bool` clause semantics and why `filter` is cached.

> **CHAPTER 7 SUMMARY**
>
> The analysis chain — character filters, tokenizer, token filters — is a schema decision,
> not a runtime setting, because its index-time output is the terms dictionary and its
> query-time output is what you search for. A mismatch between the two is **silent**: you
> get fewer results, not an error, and the only fix is a reindex with an alias swap. A string
> field that is both searchable and aggregatable is normally a `text` with a `keyword`
multi-field, declared explicitly rather than inferred, and the failure modes run in both
> directions — `keyword` on prose means nothing ever matches, `text` on an enum means case-
> sensitive filters and aggregations fail. Dynamic mapping is the quiet disaster: each new
> JSON key is a new *field*, with its own dictionary, postings, `doc_values` and mapping
> entry, and deleting the documents does not remove it, so the defences are `dynamic:
> false`, `dynamic: strict`, dynamic templates, or `flattened`. And a query against an
> unmapped field is not an error — it is zero results, which is the single most common
> Elasticsearch debugging session. In the `bool` query, the `filter` context is where the
> performance is: unscored, cacheable, and the right home for every hard constraint.

## Chapter 8 — Elasticsearch: Shards, Replicas & Operations

### 8.1 Shard Sizing, Replicas, and the Health Colours

An index is split into **primary shards**, each of which is a complete Lucene index. Each
primary has zero or more **replicas**, which are full copies. Shards are distributed across
nodes, and that distribution is the entire scaling story.

```text
  AN INDEX WITH 5 PRIMARIES, 1 REPLICA, 6 NODES
  ───────────────────────────────────────────────────
  node-1:  P1  R3        │ node-2:  P2  R4
  node-3:  P3  R5        │ node-4:  P4  R1
  node-5:  P5  R2        │ node-6:  (free capacity)

  HEALTH
  ───────
  GREEN   every primary AND every replica is assigned.
          You can lose any single node and keep serving reads
          AND writes at full capacity.

  YELLOW  every primary is assigned; some replicas are not.
          YOU ARE SAFE FROM DATA LOSS, but you have lost read
          redundancy and some nodes are doing more work.
          Most often caused by a single-node cluster (a replica
          cannot be placed on the same node as its primary) or
          by not enough nodes for the replica count you asked for.

  RED     at least one primary is unassigned.
          A SHARD OF DATA IS CURRENTLY UNAVAILABLE. This is a
          paging incident. Common causes: a full disk (the
          watermark check is a disk-space check, not a disk-health
          check), a crashed node that has not recovered, or
          allocation rules that cannot place a shard.

  THE DISK WATERMARKS ARE WORTH KNOWING
  ─────────────────────────────────────
  low:      ~85%  — no new shards allocated to this node
  high:     ~90%  — the read-only-allow-delete block is set on
                    that node's indices: writes fail
  flood-stage: ~95% — the index is forcibly set read-only
  The last one is the incident-memorable one: at 95% disk, an
  index goes read-only across the cluster and the error is
  "cluster_block: read only-allow-delete", which reads like a
  permissions problem and is not one.
```

> **MUST REMEMBER**
>
> Yellow means *no data loss but reduced redundancy*; red means *a primary is missing and
> that data is unavailable*. The most common cause of both on a small cluster is asking for
> more replicas than there are nodes to place them on. And a cluster that goes read-only
> with a `cluster_block` error is, nine times out of ten, a disk-space problem, not a
> permissions problem.

### 8.2 Shard Sizing, Rebalancing, and the Number to Argue About

The guidance is elastic: target roughly **10–50 GB per shard**, keep shards under about
**200 million documents**, and validate by benchmarking rather than formula. (Verify against
the current
[shard sizing guidance](https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html);
this number has been revised before and is worth quoting with that caveat.) The reasoning
behind the range:

- **Too small (many shards):** a search fans out to every shard, so query latency becomes
  `max over shards` plus coordination overhead, and a 1,000-shard index on 6 nodes means
  every node coordinating ~167 shards per query. Merges operate on small inputs and are
  expensive per byte. Cluster state and mapping serialization grow. And the index count
  itself is a common cause of memory pressure on the coordinating node.
- **Too large (few shards):** a single shard must fit in a node's heap for a query to be
  served efficiently; and relocating a shard means moving all of it, so a 2 TB shard on a
  node that must be drained is a multi-day operation. It also makes the index impossible to
  split later without a reindex.

Rebalancing is the mechanism that keeps distribution even, and it is the thing that makes
oversized shards expensive. Elasticsearch moves shards to equalise load, and it can also
*split* a shard (creating two from one) or *shrink* one — but both are relatively
expensive, rate-limited operations, and splitting changes the shard count, which changes
per-shard scoring statistics and requires client-side awareness. The practical consequence:
**choosing a shard count at index creation is close to irreversible in practice**, because
changing it later means a reindex. This is the same reversibility argument as a schema
decision in Volume 6, and it is why "how many shards" belongs in design review rather than
in a default.

### 8.3 Near-Real-Time Search: Refresh, Translog, and `refresh=wait_for`

The latency between `index` and being able to `search` is a deliberate design choice, and
understanding it is one of the most distinguishing Elasticsearch topics.

```text
  THE WRITE PATH, WITH THE TWO BUFFERS
  ────────────────────────────────────
  index()  ──▶ in-memory indexing buffer
                  │
     every index.refresh_interval (default 1s)  ← the SEARCHability boundary
                  │
                  ▼
           new immutable segment, searchable
                  │
     every translog flush (fsync)              ← the DURABILITY boundary
                  ▼
           on disk, commit point recorded

  translog: every operation since the last commit is appended to a
  on-disk log. On crash, the translog is replayed to recover
  documents that were indexed (possibly searchable) but not yet
  flushed. This is durability, not visibility.

  THE TRADE, EXPLICITLY
  ────────────────────
  refresh_interval = 1s   →  ~1s indexing-to-searchability latency,
                            frequent small segments, more merge work
  refresh_interval = 30s  →  ~30s latency, fewer and larger segments,
                            much less merge overhead — the right setting
                            for a bulk-load-then-search index
  refresh_interval = -1   →  manual refresh only. Correct for a load
                            job; dangerous for a live index.
```

```json
// Force a document to be searchable before the next query.
POST /orders/_doc/1?refresh=wait_for
{ "customer": "4821", "total": 120.00 }

// Refresh the whole index explicitly — expensive, O(segments).
POST /orders/_refresh
```

`refresh=wait_for` is the right tool and the wrong default. It blocks the indexing call
until the next automatic refresh happens, so the document is searchable when the call
returns. That is exactly what a read-your-writes test needs, and exactly what you do not
want on a bulk ingest of a million documents, where calling `refresh=wait_for` per document
would serialise the whole load on the refresh interval. The right pattern is: bulk-index
without it, then one explicit `_refresh` at the end of the batch.

### 8.4 `search_after` vs `from`/`size`, and the Deep-Paging Bill

`from`/`size` is offset-based. `from=10000` means "compute the top 10,010 matching
documents, and give me the last 10." Every one of the 10,000 you skip is fetched, scored,
and thrown away — which is why `index.max_result_window` defaults to **10,000** and why
deep paging is a memory problem, not a latency problem: the coordinating node holds
`from + size` hits in heap.

```json
// - deep offset paging — O(from) work and O(from) memory
GET /orders/_search?from=100000&size=20

// + search_after — O(size) per page, resumable, no offset
// last page's sort values become the cursor for the next page
GET /orders/_search
{
  "size": 20,
  "sort": [ { "created_at": "asc" }, { "_id": "asc" } ],
  "search_after": [ "2026-01-15T10:00:00Z", "doc-88213" ],
  "query": { "match": { "status": "SHIPPED" } }
}
```

Three rules that make `search_after` correct, and all three are commonly missed:

1. **You must have a deterministic sort.** Add a tiebreaker — a unique field like `_id` or
   a monotonic sequence number — as the last sort key. Without it, documents with equal
   values on the primary sort key can be skipped or repeated across pages.
2. **The sort values are the cursor, so they must round-trip exactly.** Date and numeric
   types are the ones that bite, because JSON serialisation and re-parsing must return
   byte-identical values.
3. **PIT (point in time) for consistency.** Without a point-in-time, the underlying
   segments can merge between pages and a document can move between the "before" and
   "after" sets, which silently duplicates or drops hits. A PIT freezes the view.

The comparison with `scroll` is worth having: `scroll` was the original deep-paging
mechanism and is still appropriate for *exporting* an entire result set (where you want a
stable snapshot and do not care about latency to the first hit), while `search_after` is for
*interactive* pagination where you want the first page fast. Using `search_after` for a
full export and `scroll` for a paginated UI is backwards from how they are usually
described.

### 8.5 "Elasticsearch Is Not a Database" — the Argument, Honestly

The common version of this claim is unhelpfully categorical: "don't use Elasticsearch as a
database, it's a search engine." The version worth giving in an interview is specific about
what you lose, and equally specific about what the situation is.

```text
  WHAT YOU LOSE, PRECISELY
  ───────────────────────
  • JOINS. No native relational join. Elasticsearch 8+ has a
    `parent_id`-style join field, and there are app-level
    techniques (denormalisation, the join field, an app-side
    second query, a composite aggregation for entity aggregation).
    All of them are the reason your ES cluster has denormalised
    copies of data that lives in Postgres.

  • TRANSACTIONS ACROSS DOCUMENTS. Single-document operations
    are atomic (an index/delete of one doc is all-or-nothing);
    a multi-document operation is not. There is no rollback. This
    is why a denormalised ES index can be *partially* updated
    and stay that way.

  • REFERENTIAL INTEGRITY. Nothing enforces that a document's
    foreign key points at a live document. Nothing prevents
    orphans, nothing cascades, nothing validates.

  • DURABILITY MODEL. The translog gives you at-least-once
    semantics with a recovery window. It is not a synchronous
    commit-per-transaction like a relational WAL forced on
    commit, and you configure `durability: request` (default,
    fsync per request) vs `durability: async` (fsync
    periodically) explicitly.

  ─────────────────────────────────────────────────────
  WHAT IT IS GENUINELY EXCELLENT AT
  • Full-text search with real relevance scoring, and analyzers
  • Aggregation pipelines that no relational engine does as
    naturally: nested aggregations, terms, percentiles,
    cardinality (HyperLogLog), date histograms, top-hits,
    geo, and a composable pipeline over them
  • Near-real-time ingest at high volume, and near-real-time
    aggregations that would be expensive full scans elsewhere
  • Horizontal scale of search, which is the specific thing
    relational engines do worst

  ─────────────────────────────────────────────────────
  THE HONEST ARCHITECTURE THAT RESULTS
  Postgres (source of truth, transactions, integrity)
      │  change data capture / app dual-write / outbox
      ▼
  Elasticsearch (search index, aggregations, derived)
      │
      ▼
  a denormalised copy that is allowed to be stale, whose
  staleness bound you have chosen deliberately, and whose
  rebuild path you have actually tested
```

The staff-level addition, which is the part that gets candidates hired: **the reason
Postgres-as-a-search-engine fails and Elasticsearch-as-a-source-of-truth fails is the same
reason — both were asked to do the one thing they are worst at.** Postgres without a
full-text index does sequential scans and `ILIKE`, and the `pg_trgm` extension is a
workaround rather than a solution. Elasticsearch as source of truth means giving up
transactions, integrity, and joins for a store whose durability model you have to configure
explicitly. The two technologies are complements, and the design question is only *which
one owns which reads*.

> **STAFF-LEVEL CONSIDERATION**
>
> The org-level consequence of the search-index architecture is that you now have two
> systems that disagree, and someone has to own the reconciliation. The moment you have a
> Postgres table and an Elasticsearch index derived from it, you have a distributed
> consistency problem with a staleness bound, and the three questions to get answered
> explicitly are: what is the acceptable staleness, what happens when a rebuild is needed
> (and has anyone ever run a full rebuild in production under load?), and what is the
> consumer's behaviour when the index is behind — a product search that misses a just-added
> product is cosmetic, a permissions filter that lags is a security incident. Raising those
> three questions unprompted is the difference between a candidate who knows Elasticsearch
> and a candidate who has operated it.

#### Common Mistakes

- Treating yellow as an outage — it is lost redundancy, not lost data
- Sizing shards by dividing a data estimate by a number, and never benchmarking
- Confusing refresh with flush, or calling `refresh=wait_for` on every document in a bulk load
- Deep-paging with `from=100000` and blaming the cluster for the memory pressure
- Using `search_after` without a unique tiebreaker in the sort, and silently skipping
  documents
- Treating `scroll` as the right tool for interactive pagination
- Saying "Elasticsearch is not a database" as a slogan rather than as a list of what is
  lost — joins, cross-document transactions, referential integrity, and a configurable
  durability model

#### Interview Questions — Shards, Replicas & Operations

**Q1. Yellow vs green vs red — what does each mean, and what causes each?** `TRICKY`

Green means every primary and every replica is assigned to a node, so you can lose any one
node and keep serving both reads and writes at full capacity. Yellow means every primary
is assigned but some replica is not — you have no data loss risk, but you have lost read
redundancy and the surviving nodes are carrying extra load. The overwhelmingly common cause
is a cluster with fewer nodes than the replica count you asked for: a replica cannot be
placed on the same node as its primary, so a 3-node cluster asking for 1 replica is fine
but a 1-node or 2-node cluster asking for 1 replica is permanently yellow. Red means at
least one primary is unassigned, so a shard of data is currently unavailable — this is a
paging incident, and the usual causes are a full disk, a crashed node that has not
recovered, or allocation rules that cannot place the shard anywhere.

**Q2. A cluster goes read-only with `cluster_block: read only-allow-delete`. What is the
first thing you check?** `ADVANCED`

Disk space, on the node reporting it. Elasticsearch sets disk-space watermarks on each
node, not on the cluster: around 85% no new shards get allocated to the node, around 90%
the read-only-allow-delete block is set on that node's indices so writes fail, and at the
flood-stage watermark (about 95%) the index is forcibly set read-only. The error reads
like an IAM or cluster-setting problem and it is neither, which is why it misleads people
who go looking at security groups first. The check is the disk usage per node in the
cluster health API, and the durable fix is either more disk, a delete-by-query or an
index rollover to move data off the hot node, or disabling the relevant watermark if you
know the disk is transiently full. The staff-level addition is that this belongs in an alert
on *free disk space per node* at something like 80%, because by the time the block is set,
writes are already failing.

**Q3. How many shards should an index have, and how would you decide?** `STAFF`

By measurement, with the current guidance as a starting point: roughly 10–50 GB per shard
and under about 200 million documents, validated by benchmarking on production-shaped
data. The reasoning behind the range is worth more than the number. Too many small shards
means every query fans out across all of them, so latency is the max over shards plus
coordination overhead; merges operate on tiny inputs and cost disproportionately per byte;
and cluster state and mapping serialisation grow with the field and shard count, which is
itself a memory pressure. Too few large shards means a shard may not fit comfortably in a
node's heap, and relocation becomes an operation that moves terabytes — making node
maintenance a planned outage rather than a rolling drain. The reason this is a design
decision rather than a config tweak is reversibility: increasing shard count on an existing
index means a reindex, and even the built-in split operation is expensive and rate-limited.
So the honest answer is: pick a count you can live with, benchmark it against your actual
query mix and your data volume, and prefer slightly larger than the failure mode of too
many, because too many is the more common mistake and the more expensive one to fix.

**Q4. What is near-real-time search, and what is the trade?** `ADVANCED`

The gap between a successful `index` call and the document being visible to a `search` is
the refresh interval, defaulting to 1 second. Indexing appends to an in-memory buffer;
every refresh interval that buffer becomes a new immutable segment and becomes searchable.
That is the whole mechanism, and the interval is a tunable because both sides of it cost
something: at 1 second you get roughly a second of visibility latency and many small
segments, which means more merge work and worse search performance; at 30 seconds you get
much less merge overhead and larger segments, which is right for a bulk-load-then-search
index. This is separate from durability, which is the translog: every operation since the
last commit is appended to an on-disk log, and on restart it is replayed to recover
documents that were indexed but not yet fsynced. So refresh governs visibility, the translog
governs durability, and the two settings are tuned for different reasons. Where a
read-your-writes guarantee is needed, `?refresh=wait_for` blocks the index call until the
next refresh so the document is searchable when the call returns — correct for a
single-document read-after-write, and exactly the wrong thing to do per-document in a
million-row bulk load, where you index without it and issue one explicit `_refresh` at the
end.

**Q5. Why is `from=100000` expensive, and what is the alternative?** `TRICKY`

`from`/`size` is an offset. `from=100000, size=20` means the coordinating node fetches,
scores and holds 100,020 matching documents in order to return the last 20, so both time
and heap grow with `from + size`. That is why `index.max_result_window` defaults to 10,000
— the limit exists because the cost is real. `search_after` replaces the offset with a
cursor: you sort, take the sort values of the last document on a page, and pass them as
`search_after` to get the next page, so each page costs O(size) rather than O(from). Two
things make it correct rather than merely faster. You must sort on a unique tiebreaker as
the last sort key — without it, documents with equal values on the primary sort key can be
skipped or repeated between pages, silently. And for a consistent view across pages you
need a point in time, because segment merges between page requests can move a document
across the boundary and duplicate or drop it. And keep `scroll` in mind for the other case:
exporting a whole result set, where a stable snapshot matters more than first-hit latency,
is what `scroll` is for.

**Q6. Argue that Elasticsearch is not a database — and then argue the other side fairly.**
`STAFF`

The categorical version is unhelpfully stated; the useful version names what is lost. What
you lose precisely: native joins — Elasticsearch has no relational join, and the
`join`/`parent_id` field and the app-side workarounds all exist because the denormalised
copies of Postgres data are why the cluster is fast; transactions across documents, since a
single-document index is atomic but a multi-document one is not, which is how a denormalised
index becomes partially updated and stays that way; referential integrity, since nothing
enforces that a foreign key points at a live document and nothing cascades; and a
synchronous commit-per-transaction durability model, since you choose `durability: request`
or `async` explicitly and get at-least-once semantics with a recovery window. What it is
genuinely better at: full-text search with real relevance scoring and analyzers, an
aggregation pipeline (nested aggregations, cardinality, percentiles, date histograms,
top-hits, composable) that no relational engine does as naturally, near-real-time ingest at
volume, and horizontal scale of search — which is the specific thing relational engines do
worst. So the fair architecture is Postgres as source of truth with Elasticsearch as a
derived search index over it, fed by CDC or dual-write, with a chosen staleness bound and a
rebuild path that has been tested under load. And the real insight is that Postgres-as-search-
engine and Elasticsearch-as-source-of-truth fail for the same reason: each was asked to do
the one thing it is worst at.

**Q7. `search_after` is returning duplicate documents. What is wrong?** `ADVANCED`

Almost certainly the sort is not deterministic. `search_after` is a cursor made of the sort
values of the last document on the previous page, and the next page is defined as "the next
documents in this sort order" — but if two documents tie on your sort key, the order between
them is arbitrary and not stable across the segment merges that happen between page
requests, so one can appear on both pages and another on neither. The fix is to add a
unique tiebreaker as the final sort key, usually `_id` or a monotonic sequence number:
`"sort": [{"created_at": "asc"}, {"_id": "asc"}]`, and then include *both* values in
`search_after`. A second cause is mixing sort directions without a matching tiebreaker in
the same direction — an ascending primary with a descending tiebreaker still leaves ties
unordered. A third, subtler cause is not using a point in time: without a PIT the segment
set changes between page requests, so a document can move. And a fourth is
serialisation — if a sort value is a date or a float and it does not round-trip
byte-identically between the response and the next request, the cursor lands in the wrong
place. I would also check the sort mode: `sort` versus `max` doc values mode changes
whether duplicate values are deduplicated in the sort, which changes the page boundaries.

**Q8. We need to reindex 400 million documents. What is the plan, and what is the risky
part?** `SCENARIO`

The plan: create the new index with the updated mapping and a slower `refresh_interval`
(30s or more) so the build does not pay refresh cost, and with replicas set to 0 so the
build does not double the indexing load. Then index from the source of truth — `_reindex`
from the old index if the data lives in Elasticsearch, or a scan-and-index from Postgres if
it does not, and prefer a scan with a stable keyset-ordered cursor over a scroll if the
source is large. Throttle to leave headroom for live traffic, because a reindex that
saturates the cluster takes down search, not just the migration. Monitor the count gap
continuously rather than at the end. The risky part is the cutover and everything around
it: the alias swap is atomic and safe, but the read-your-writes window, the cache warm-up,
the doubled cluster during the overlap, and the disk headroom for two full copies are the
things that go wrong — and people run out of disk *before* the reindex finishes, which is
the single most common way this goes sideways. The other risk that gets skipped is
validating the mapping change, not just the row count: the count can match perfectly while
the new analyzer makes every query return zero results, which is exactly the failure mode
of an analysis change and the reason a sample-query comparison belongs in the plan. I would
also want a rehearsed abort: how you roll back, and whether the old index is still there
when you find the problem an hour after cutover.

#### Further Reading

- [Elasticsearch — Cluster health](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster-health.html) — green/yellow/red semantics, the allocation explainer, and unassigned-shard diagnosis.
- [Elasticsearch — Size your shards](https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html) — the current 10–50 GB and document-count guidance, and why there is no single shard count.
- [Elasticsearch — Disk-based allocation deciders](https://www.elastic.co/guide/en/elasticsearch/reference/current/disk-based-allocation-deciders.html) — the low/high/flood-stage watermarks and the read-only-allow-delete block.
- [Elasticsearch — Paginate search results](https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html) — `from`/`size`, `search_after`, scroll, and point-in-time.

> **CHAPTER 8 SUMMARY**
>
> An index is a set of primary shards, each a full Lucene index, with full-copy replicas
> distributed across nodes — and the health colours mean specific things: green is full
> redundancy, yellow is *no data loss but lost read redundancy* (usually too few nodes for
> the requested replica count), red is an unassigned primary and a paging incident. A
> cluster that goes read-only with `cluster_block: read only-allow-delete` is a disk-space
> problem, not a permissions problem, because the watermarks are per node at roughly 85,
> 90 and 95 percent. Shard count targets roughly 10–50 GB and under ~200 million documents
> per shard, and it is a near-irreversible decision because changing it means a reindex.
> Near-real-time search is the ~1 second refresh interval — visibility, not durability,
> which is the translog — with `?refresh=wait_for` for read-your-writes and one explicit
> `_refresh` at the end of a bulk load rather than one per document. `search_after`
> replaces offset paging because `from=100000` materialises 100,020 hits in heap, and it is
> only correct with a unique tiebreaker in the sort and a point in time. And the honest
> version of "not a database" is a list of what is lost — joins, cross-document
> transactions, referential integrity, and a configurable durability model — next to what it
> is genuinely better at, which is why the answer that survives scrutiny is Postgres as
> source of truth with Elasticsearch as a derived index over it.

## Chapter 9 — Putting It Together — Choosing a Store

### 9.1 The Table, and How to Read It

Volume 10's closing chapter carries a decision table covering the NoSQL stores only —
Cassandra, DynamoDB, MongoDB and the consistency-model comparison. This is the
**all-eight** table: the relational engines, the cache, the object store, and the search
engine alongside them, with the columns that actually differ between them rather than a
feature checklist. Read it as a set of trade-offs, not a scoring exercise.

| Store | Fits when | Fails when | Consistency | Joins | Scale lever | Reversibility |
| --- | --- | --- | --- | --- | --- | --- |
| **PostgreSQL** | you need transactions, joins, and ad-hoc queries over relational data; the write volume is human-scale | the write volume is orders of magnitude beyond a single node's, or you need multi-region writes with local latency | strong, MVCC | native, and the best in the set | read replicas, then partitioning, then sharding (Vol 6) | high before sharding, low after |
| **MySQL** | same as Postgres, plus you have a team already fluent in InnoDB specifics | you need the richer types, the better planner, or `SELECT` extensions Postgres has | strong, InnoDB RR (Vol 8) | native | read replicas, then sharding | high before sharding |
| **Redis** | the data is a cache, a session store, a rate limiter, a queue, or a lock; access is by key | it is the source of truth for anything you cannot rebuild | strong per key, with the async-replication caveats of Vol 9 | none; deliberate | vertical, then cluster; memory is the hard limit | very high — the data is rebuildable by definition |
| **Cassandra** | the write volume is enormous, the access pattern is known and narrow, and you can accept tunable consistency | you need ad-hoc queries, secondary indexes, or strong cross-partition consistency | tunable per operation, `QUORUM`/`ONE` (Vol 10) | none by design; denormalise into tables | horizontal, trivially — this is its reason to exist | **low** — the schema *is* the query set |
| **DynamoDB** | key-value or document at scale, access patterns known and few, you want managed operations | the access pattern is unknown, you need ad-hoc queries, or you need real joins | strong reads or eventually consistent reads, per operation | none; single-table design | automatic, on demand | **very low** — access patterns are baked into the key design |
| **MongoDB** | documents are genuinely document-shaped, you read them whole, and you want flexibility | you need joins across entity types, or strong cross-document transactions at scale | strong reads, causal-session writes | `$lookup` exists and is a smell at scale | replica sets, then sharding by a chosen key | low once aggregations depend on the shape |
| **S3** | objects are large, immutable, write-once, and fetched by exact key or well-known prefix | you need to find objects by an attribute, update part of one, or join two | strong read-after-write for `PUT`/`DELETE`/`LIST` since Dec 2020 | none; no query layer | horizontal and effectively unbounded | **very high** for the bytes, **zero** for the semantics |
| **Elasticsearch** | full-text search, relevance scoring, and aggregations over denormalised documents | it is the source of truth, or you need joins or cross-document transactions | near-real-time search (~1s); refresh-based, not transactional | none; the join field and `$lookup`-alikes are workarounds | shards and replicas; ~10–50 GB per shard | **very low** — the mapping is the schema and changing it means a reindex |

Three observations the table is designed to make visible:

- **Only two of the eight do joins.** PostgreSQL and MySQL. Everything else makes you
  denormalise, and denormalisation is a consistency mechanism you now own.
- **The most reversible stores are the least authoritative.** S3 and Redis are cheap to
  change your mind about because their contents are rebuildable or replaceable. Cassandra,
  DynamoDB and Elasticsearch are the hardest to change your mind about, and the reason is
  the same in all three: **the access pattern is encoded in the schema** — the key
  structure, the partition key, or the mapping. That is the one property on this list that
  correlates almost perfectly with "how hard is it to migrate away", and it is the single
  most useful thing to say in a design review.
- **Elasticsearch and Postgres are complements, not competitors.** The correct answer for
  almost every real system that has search is both, with a chosen staleness bound between
  them.

### 9.2 The Four Questions That Actually Decide It

Everything above collapses to four questions, and asking them in this order is the
difference between a store decision and a technology preference.

1. **What is the access pattern — and how confident are you in it?**
   "Fetch this exact key" is a key-value store. "Fetch by known prefix" is S3. "Fetch by
   any combination of five attributes, and I cannot predict which" is relational, because
   the whole value of a relational engine is that you do not have to predict. The confidence
   question is the important half: DynamoDB, Cassandra and Elasticsearch are excellent when
   you know your access patterns and expensive to change when you discover a new one, and
   "we will definitely need a dashboard that filters by X" is the requirement that should
   push you to something flexible before you have built the schema.
2. **What is the write volume, and what is its shape?**
   Thousands per second of transactional, relational writes is a database. Hundreds of
   thousands per second of append-only, key-addressed writes is DynamoDB or Cassandra, or
   S3 for the raw bytes. Tens of millions of small objects with no read pattern is S3 and a
   query engine on top. The "shape" half matters: the same volume of *updates to existing
   rows* is a completely different problem from the same volume of *new rows*.
3. **What is the consistency requirement, per read?**
   Not "per system" — per read, which is the point from the Microservices set's CAP chapter
   (Volume 2, Chapter 1 owns CAP as an architecture question; this set's Volume 10 owns it
   as a database question). The question to answer in a design review is "**which reads, if
   stale, would a user call a bug?**" — and the answer is usually a short, identifiable
   list: your balance, your order status, your permission check, your write confirmation.
   Everything else can be eventually consistent, and the cost of eventual consistency is
   paid by the UI, not by the database.
4. **What query flexibility do you need, and when will you know you needed it?**
   Ad-hoc, unpredictable queries are relational. A fixed, enumerable set is a key design.
   The trap is not choosing a narrow store for a narrow workload — it is choosing one
   while your product is still discovering what to build, because narrow stores are the
   ones where the cost of a new access pattern is a migration.

### 9.3 Reversibility as the Tiebreaker

When the four questions do not produce a clear answer, the tiebreaker is **reversibility**,
and it is the argument that actually wins design reviews.

```text
  THE REVERSIBILITY LADDER
  ────────────────────────
  CHEAP TO CHANGE MIND ABOUT
    • Redis → nothing. The cache is a cache. Delete it and it
      rebuilds. (Only a lock or a rate limiter changes the cost,
      and only for the duration of the migration.)
    • S3 → nothing for the bytes. The objects are addressable and
      content-addressed by key. Restructuring the key layout means
      rewriting objects, which is a batch job, not a migration.
    • Postgres → MySQL, and back, mostly. Rich type differences
      and extension dependencies are the tax; the relational model
      is portable.
  EXPENSIVE
    • Postgres → sharded, multi-region, or partitioned-by-hand.
      Once the application knows about shards, the sharding is
      everywhere. Volume 6.
  VERY EXPENSIVE — THE ACCESS PATTERN IS THE SCHEMA
    • DynamoDB, Cassandra: the key design IS the query interface.
      A new access pattern means a new table or a new secondary
      index, and a hot partition or an unbounded-scan fix is a
      re-projection of the whole dataset.
    • Elasticsearch: the mapping is the schema, it is not
      retroactive, and changing an analyser means a reindex.
    • Any of them → something else: you are re-deriving
      denormalisation, and you are re-deriving it under load.
```

The practical reading: **choose the store whose query model matches the access patterns you
are least sure about, and keep the store that owns your invariants in the one that is
easiest to leave.** That is usually Postgres for the invariants, plus a derived store for
the access pattern you are still discovering, plus S3 for the bytes. The counter-argument
worth making in a design review is that this is also a bias toward the familiar, and if
you genuinely have a hundred thousand writes per second of key-addressed data on day one,
the narrow store is correct and the "start relational and migrate" advice is a way of
avoiding the measurement.

### 9.4 Adding a Store to a System That Already Has One

The realistic question is rarely "which store" for a greenfield system. It is "we have
Postgres and we now need search / object storage / a cache — what is the order of
operations?" A sequence that works:

1. **Do nothing you cannot justify with a query that is currently slow.** The trigger for
   adding a store is a *named* slow query or a *named* access pattern, not a scale
   projection. "We might need 10× the traffic" is not a trigger; "this report is a 90 s
   p99 on 400 million rows" is.
2. **Add the cheapest reversible thing first.** For read-heavy paths that are simply
   expensive, that is Redis with a proper cache-aside pattern and a real eviction policy
   (Volume 9 owns the mechanics; the three classic bugs — stampede, penetration, avalanche —
   are the failure modes you are buying into). For large binary content, that is S3 with
   the row pointing at a key. Neither requires changing the system of record.
3. **Only then add a store that encodes the access pattern.** Search is the common case:
   build the index from Postgres (via logical replication, Debezium, or a dual-write with
   an outbox), define the staleness bound explicitly, and — before you need it — rehearse a
   full reindex under load. A search index you have never rebuilt is an outage with a
   scheduled start time.
4. **Move ownership last, if at all.** Extracting a service's data into its own store is
   the step that is expensive in every direction: the data moves, the transactions stop
   spanning, and the joins that were free become application code or a saga. Microservices
   Volume 2 owns that conversation as a service-boundary problem; the database-specific
   point is that the extraction is only worth it when the access pattern is genuinely
   different, not merely because the data is "big".

> **PRODUCTION RELEVANCE**
>
> The failure mode of every one of these additions is the same: two systems that can
> disagree, and no named owner for the disagreement. The single highest-value artefact you
> can produce when you add a derived store is a one-page document listing what it is
> derived from, how stale it is allowed to be, what happens when it is behind, and who gets
> paged. That document is what turns "we have two sources of truth" from an incident into a
> known property of the system.

#### Common Mistakes

- Treating the store choice as a feature comparison rather than a set of access-pattern,
  volume, consistency and flexibility questions
- Answering the consistency question per *system* rather than per *read*
- Choosing a narrow store (DynamoDB, Cassandra) while the product is still discovering its
  queries, and calling the resulting migration cost "not a big deal"
- Adding a store to fix a slow query that was never named, measured, or attributed
- Believing Redis is a system of record, or that a derived index needs no staleness contract
- Ordering the work as "migrate the data first, migrate the reads second"

#### Interview Questions — Choosing a Store

**Q1. Walk me through how you'd choose a store for a new system.** `STAFF`

Four questions, in this order. Access pattern first, including the confidence level: exact
key is a key-value store, known prefix is S3, and "any combination of five attributes,
unpredictable" is relational, because the value of a relational engine is precisely that you
do not have to predict. Then write volume and shape — thousands per second of transactional
relational writes is a database, hundreds of thousands of key-addressed appends is DynamoDB
or Cassandra, tens of millions of objects is S3 plus a query engine — and note that updates
to existing rows are a different problem from new rows at the same volume. Then consistency
*per read*: which reads, if stale, would a user call a bug, and that list is usually short
and identifiable. Then query flexibility and when you will know you needed it. If those four
do not produce a clear answer, the tiebreaker is reversibility — prefer the store whose query
model matches the patterns you are least sure about, and keep the store that owns your
invariants in the one that is easiest to leave.

**Q2. When would you choose S3 over a database, and what would the architecture look
like?** `STAFF`

When the objects are immutable, write-once, large or awkward as rows, and read by exact key
or a well-known prefix — media, backups, data-lake partitions, model artefacts, audit
objects. The economics decide it: eleven nines, multi-AZ redundancy, and data transfer
*in* is free, so backup-to-S3 is close to free and the object storage is effectively
unlimited. The architecture is never "S3 instead of a database" — it is a database whose
rows point at keys, with S3 holding the payloads. That shape gives you the durability and
scale of S3 for the bytes and the transactions, integrity and indexes of Postgres for the
metadata, and it is what nearly every correct S3 architecture looks like. The line not to
cross: if you need to find objects by an attribute, update part of one, join two, or count
them, you have crossed into needing an index, and the answer is a store that has one.

**Q3. Our team wants DynamoDB because it scales. You don't think it fits. What do you ask
them?** `STAFF`

Not "do you know DynamoDB" — four questions, in this order. (1) *What are your access
patterns, listed, with the queries you will run against each item?* Not the eventual
queries, the ones you will write in the first month, because in DynamoDB the key design *is*
the query interface and every new access pattern is a new table, a new GSI, or a scan.
(2) *What is your consistency requirement per read, and which reads would be a bug if
stale?* Strongly consistent reads cost twice as much and are not free in latency; the answer
tells you how much of the design is read-side. (3) *What are your item sizes and your access
distribution, and do you have a tenant or a leading key that will concentrate?* A partition
key with a heavy hitter is the failure mode that takes the whole table's throughput, and
DynamoDB's adaptive capacity mitigates it at a cost rather than solving it. (4) *What happens
when you need a query you did not anticipate?* This is the reversibility question and it is
the one that decides it. If the honest answer is "we don't know yet", Postgres with a
read replica is the better bet, because the cost of a new query there is an index rather
than a migration. If the access patterns are genuinely known, few, and high-volume, DynamoDB
is correct and the objections are about operational maturity, not fit.

**Q4. When would you shard, and what makes that reversible?** `ADVANCED`

Shard when the symptom is a specific, measured limit that a cheaper intervention has not
fixed — a primary's write throughput ceiling, storage that a replica set cannot relieve
under the write pattern, or a working set that will not fit in memory. In that order of
preference: replicas for read scale, then partitioning for pruning and for maintenance
windows, then vertical scaling, and only then sharding. The part that makes it irreversible
is not the split itself — it is the **key** you split on, because the split key propagates
into every query, every foreign key, every unique constraint, and every cross-shard
transaction. So the reversibility test is: can you re-shard later without changing the
application? That holds if the split key is a property of the data every query already
filters on, if you have no cross-shard joins or unique constraints, and if you route
queries through a layer that knows where each key's data lives. It fails the moment
transactions span shards, unique constraints span shards, or a query must fan out to all
shards — and each of those is cheap to prevent before you shard and expensive to remove
after. The concrete technique for keeping it reversible is to introduce the routing layer
and the split key *before* the split, so that changing the topology later is a
configuration change rather than a rewrite.

**Q5. We have Postgres. We now need search. What is the order of operations, and what is
the part people skip?** `STAFF`

Build the index from Postgres, not from application writes, if you can — logical
replication or a CDC tool like Debezium, because dual-write means two code paths that can
diverge and no way to tell which is authoritative. Then define the staleness bound
explicitly and write it down: what is acceptable, what a consumer should do when the index
is behind, and for which reads a stale index is a cosmetic issue rather than a correctness
one. Then rehearse a full reindex under production-like load, because a search index you
have never rebuilt is an outage with a scheduled start time, and the reindex is the moment
you discover that the new mapping is fine on paper and that half your documents fail to
index. The part people skip is that last one. Ownership should move last and only if the
search index genuinely becomes a source of truth for reads, because that is the step where
transactions stop spanning and joins become application code.

**Q6. Redis or Postgres for this?** `TRICKY`

Redis if the data is derivable or expendable — a cache, a session store, a rate limiter, a
short-lived queue — because it is a cache with the durability caveats of Volume 9, and
because being able to delete the whole dataset and have it rebuild is the property that
makes it low-risk. Postgres if the data is a fact you cannot reconstruct. The trap is
intermediate: putting durable state in Redis *because it is there*, and then discovering
that an eviction policy you enabled to protect memory has evicted your queue's in-flight
items. If you are using Redis as a queue or a lock, the durability model is now your
problem and it is not the same as the cache model, and the failure modes are different — a
lost lock is a correctness bug, a lost cache entry is a slow request. The question that
separates them is: "if this key disappeared right now, would we lose information, or would
we do some work?" Information means Postgres; work means Redis.

**Q7. Your p99 on a report query is 90 seconds on 400 million rows. Walk me through what
you would do, in order, and which step is hard to undo.** `STAFF`

In order, and the order is the point because the first four are cheap and reversible.
Measure first — `EXPLAIN (ANALYZE, BUFFERS)` — because "90 seconds" is a symptom and the
cause might be a missing index, a stale statistic making the optimiser pick a nested loop,
or a single wide row. Then add the index that the query's *access pattern* implies, if one
is missing; that is a day. Then fix the statistics if they are stale; that is an hour. Then
add a covering index so the query is index-only, accepting the write amplification. Then
materialise it — a materialized view refreshed on a schedule, or a cache of the result —
accepting staleness as the price. Only after all of that, and only if the numbers still
demand it, consider the structural options: partitioning the table by a range so the query
prunes, or a read replica dedicated to this report so it stops competing with OLTP.
**The step that is hard to undo is the partitioning**, and specifically the choice of
partition key, because it becomes part of every future query and every future maintenance
operation, and changing it means moving data. Adding a read replica is genuinely easy to
reverse; a materialized view is nearly so. I would also insist on measuring after each
step, because the cheap steps frequently make the expensive one unnecessary, and a
partitioning project undertaken on a guess is a multi-week commitment to a wrong answer.

**Q8. Your team wants to replace the relational database with a NoSQL store because
"relational doesn't scale". What is your response?** `STAFF`

Ask what specifically is not scaling, because "relational doesn't scale" is a statement
about a technology and the real statement is about a workload. The things that actually
bound a relational database are: write throughput against a single primary, storage on one
node, and the working set not fitting in memory. All three have non-replacement
interventions — replicas for reads, partitioning for pruning and maintenance, and a
better-designed schema for the working set — and all three are cheaper and more reversible
than a migration. What the narrow stores genuinely win at is a *huge* volume of simple,
key-addressed writes with a small fixed set of access patterns, and that is a real and
legitimate win. What they cost is: joins, which means denormalising and owning the
consistency; transactions across entities; and above all flexibility, because the access
pattern is encoded in the key design and a new query is a migration. So the question to put
back is: "name the query that cannot be served in the latency you need, and tell me what
the data volume and access pattern are." If they can name it, you have a real requirement
and can evaluate one narrow store against it. If they cannot, the honest answer is that
the migration buys nothing and costs the flexibility that a product still discovering its
own queries needs most.

**Q9. We need both Postgres and Elasticsearch. Who owns the truth, and what happens when
they disagree?** `STAFF`

Postgres owns the truth; Elasticsearch is a derived index over it, and that should be said
out loud in the design document because it is the sentence everything else follows from.
The disagreement is not a bug to be eliminated — it is a property with a bound, and the
three questions to answer explicitly are: what is the maximum acceptable staleness, what
does a consumer do when the index is behind, and who is paged when it never catches up. The
"consumer behaviour" question is the product one and the one that gets skipped. A product
search that misses a just-listed item is cosmetic; a permissions or compliance filter served
from the index is a security incident. Those two reads must not have the same staleness
tolerance, and if they do, the design is wrong. The operational questions are equally
important and are the ones people discover during an incident rather than during design:
how the index is kept in sync (CDC, not dual-write, because dual-write has two authorities
and no way to tell which is wrong), and whether a full rebuild has ever been rehearsed
under load. Two systems that can disagree, with no named owner for the disagreement and no
tested rebuild, is not a resilient architecture — it is a scheduled incident.

**Q10. What would make you migrate off a store, and how would you know it was the right
call?** `STAFF`

Three triggers, in increasing order of how sure you should be. First, a *measured* limit
that a cheaper intervention has not fixed — a write ceiling, a storage ceiling, a working
set that will not fit. Second, a *capability* gap that is on the roadmap, not hypothetical:
you need cross-shard transactions and no amount of configuration will give them to you.
Third, and the one people are reluctant to admit, *organisational* — the operational burden
of running the thing is more than the team can carry, and that is a legitimate reason to
move to a managed service even at a higher unit cost. The "how would you know" half matters
more: a migration is justified when the thing you are leaving cannot serve a requirement you
have, and the discipline is to write that requirement down as a query, a latency target and
a number *before* you start, so that you can tell the difference between a migration that
worked and a migration that moved the problem. And the cost side has to be counted honestly:
dual-running, backfill, the CDC or the export, the cutover, and the rollback plan that you
have actually rehearsed. The most common way these go wrong is not choosing the wrong store
— it is having no metric that would have told you the right store was the one to move to.

#### Further Reading

- [Amazon DynamoDB — Data modeling for DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html) — why the access pattern drives the key design, which is the argument behind the reversibility point.
- [Apache Cassandra — Data modeling](https://cassandra.apache.org/doc/latest/cassandra/data-modeling/index.html) — partition keys, clustering keys, and the "design for the query" principle.
- [Elasticsearch — Use Elasticsearch for your primary data](https://www.elastic.co/guide/en/elasticsearch/reference/current/elasticsearch-at-the-edge.html) — the honest guidance on when Elasticsearch is and is not a system of record.
- [Martin Kleppmann — Choosing a Data Store](https://martin.kleppmann.com/2024/11/25/choosing-a-data-store.html) — a compact, honest walk through exactly this decision, including when the answer is "more than one".

> **CHAPTER 9 SUMMARY**
>
> Of the eight stores in this set, only PostgreSQL and MySQL do joins; everything else
> makes you denormalise and own the consistency. The property that best predicts how hard a
> store is to leave is not its performance but whether **the access pattern is encoded in
> the schema** — true of DynamoDB, Cassandra and Elasticsearch, false of everything else,
> which is why the two cheapest-to-abandon stores are also the two that are not supposed to
> be authoritative. The decision collapses to four questions: the access pattern and how
> confident you are in it, the write volume and its shape, the consistency requirement *per
> read* rather than per system, and the query flexibility you need versus the flexibility
> you will discover later. And the practical sequence for adding a store to an existing
> system is: name the slow query, add the cheapest reversible thing first, add the
> pattern-encoding store only when justified, rehearse the rebuild, and move ownership last.

---

### End of Volume 11

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain S3's flat namespace precisely, including why a `/` in a key is a character and why
  prefix listing works at all — and what it costs to lean on that at 10 million objects
- State S3's consistency model correctly for today, including the December 2020 `LIST`
  change, and name the documented cases where behaviour is still asynchronous
- Name every S3 storage class's minimum storage duration and billable minimum object size,
  and explain when a read-heavy workload on an IA class costs more than storing it twice
- Say what a SigV4 presigned URL actually signs, what its real ceiling is, and why it dies
  with the credentials that made it
- Explain multipart upload's part and count limits, and why an abandoned upload is a
  permanent invisible bill
- Describe the inverted index end to end — tokenizer through dictionary to postings — and
  distinguish `_source`, postings and `doc_values` by cost and by what each can do
- Explain why changing an Elasticsearch analyser requires a reindex, and why the mismatch is
  silent
- Choose among the eight stores in Chapter 9 using the four questions, and say which one of
  them you would keep the system of record in
- Answer any question in Chapter 10 cold, in any order, and give the reason rather than the
  rule

That is the set. Eleven volumes, one argument: **a database is a set of trade-offs with
numbers attached, and the senior skill is knowing which number is the one that will matter
for your workload.**

## Chapter 10 — The Database & SQL Interview Bank

The per-volume banks in Volumes 1 to 10 are the **drill**: each is weighted toward that
volume's traps, and the right way to use one is cold, straight after finishing the matching
chapter. This bank is deliberately the opposite. It is organised **by category rather than
by volume**, so a candidate revising in one sitting can land on transactions without
remembering which of the ten volumes owns them, or on a window function without knowing
whether it was Volume 3 or Volume 6.

Four prefixes are used, and the weighting follows from the interview, not from the topic:

- **P** — production situation
- **T** — predicted behaviour ("given this query/interleaving, what happens?")
- **S** — code-review question
- **D** — design trade-off challenge

The weighting is deliberately **D-heavy** — forty design questions against a hundred and
eleven mechanics questions, one hundred and fifty-one in total. The reason is that a
`T` question tests whether you have read the material, and a `D` question tests whether you
can *use* it under pressure on something you have not seen before. At senior level the
second is what is being measured, and it is the one a per-volume drill cannot rehearse. `D`
numbers run continuously from `D1` to `D40` across the entire bank. `P`, `T` and `S` restart
at 1 within each subsection, and within a subsection the best question is first rather
than the easiest.

### SQL Syntax & Semantics

The seed table for this section. It appears in most questions so you can read them without
re-orienting:

```text
  customers                            orders
  ┌────┬────────┬─────────┐           ┌────┬─────────────┬─────────┬─────────┐
  │ id │ name   │ city    │           │ id │ customer_id │ status  │ amount  │
  ├────┼────────┼─────────┤           ├────┼─────────────┼─────────┼─────────┤
  │  1 │ Alice  │ London  │           │ 10 │ 1           │ NEW     │ 100.00  │
  │  2 │ Bob    │ London  │           │ 11 │ 1           │ SHIPPED │ 250.00  │
  │  3 │ Carol  │ Paris   │           │ 12 │ 2           │ NEW     │  75.00  │
  │  4 │ Dan    │ NULL    │           │ 13 │ 3           │ SHIPPED │ 400.00  │
  └────┴────────┴─────────┘           │ 14 │ 5           │ NEW     │  50.00  │
                                      └────┴─────────────┴─────────┴─────────┘
                                                              ↑ customer 5 does not exist
```

**T1. You run `SELECT c.name, o.amount FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'SHIPPED'`. Which customers come back?** `TRICKY`

Bob, Dan and the two orders that are `SHIPPED` — Alice and Carol, only. The `LEFT JOIN`
preserves every customer, but the `WHERE` clause runs *after* the join and filters on a
column from the right-hand table. For a customer with no matching `SHIPPED` order, the
outer-joined columns are all `NULL`, and `NULL = 'SHIPPED'` is `UNKNOWN`, not `TRUE`, so the
row is discarded. The `LEFT JOIN` has been silently converted into an inner join. The fix is
to move the right-hand predicate into the join condition —
`ON o.customer_id = c.id AND o.status = 'SHIPPED'` — or wrap it in a derived table
(`LEFT JOIN (SELECT * FROM orders WHERE status='SHIPPED') o ON ...`). Bob and Dan produce
no rows at all here, which is usually the moment the bug is noticed; the more common real
version is a report that is missing exactly the zero-order customers you needed to see.
Volume 3 owns this trap in full; the harder variant is a `WHERE` on a right-hand *nullable*
column with `IS NOT NULL`, which has the identical effect for a different reason.

**T2. Rewrite `SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM orders)`. It returns nothing. Why, and how do you fix it?** `TRICKY`

Because the subquery returns `1, 1, 2, 3, 5` — and `5` is a `customer_id` with no matching
row in `customers`. `NOT IN` expands to `id <> 1 AND id <> 1 AND id <> 2 AND id <> 3 AND
id <> 5`, and if any comparison is `UNKNOWN` the whole conjunction is not `TRUE`, so **every
row is filtered out**, not just the non-matching ones. A single `NULL` in the subquery
result does the same thing, so this bug is invisible until a delete creates an orphan. The
fix is `NOT EXISTS` with a correlated subquery, which uses a two-valued logic and is not
affected by `NULL`:

```sql
SELECT c.name
FROM   customers c
WHERE  NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```

`NOT EXISTS` is the right habit for every anti-join, because the semantics of `NOT IN` are
"never true if anything might be unknown", and in SQL the nullability of a column is
exactly the thing people forget.

**T3. `SELECT c.name, SUM(o.amount) FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.id, c.name`. What comes back, and what is silently wrong?** `TRICKY`

Four rows: Alice 350.00, Bob 75.00, Carol 400.00, and customer 4 (Dan) does **not** appear
at all, because the inner join drops him. That is the obvious part. The silent part is
that the grouping is on `c.id` (with `c.name` carried along, which every major engine
allows because `id` functionally determines `name`), and the output is *one row per
customer who has at least one order* — so this is a query about orders that happens to be
displayed with customer names, and it cannot answer "how many customers have never
ordered", which is the question the report was almost certainly for. The other trap in the
same query shape is grain: if you add a second join to a line-items table, `SUM(o.amount)`
is multiplied by the number of lines per order, and Alice's 350.00 becomes 700.00 or more.
Every double-count is a grain bug — aggregate the line-level table to the grain you need
*before* joining.

**T4. `SELECT COUNT(*), COUNT(o.id), COUNT(DISTINCT o.customer_id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id`. Three numbers — what are they?** `TRICKY`

`COUNT(*)` is **5** — one row per left-joined row, so Alice counts twice (she has two
orders) and Dan counts once. `COUNT(o.id)` is **4** — it skips the `NULL`s produced by the
outer join, so it counts only rows where a real order matched, which happens to equal the
number of orders because no order has a `NULL` `id`. `COUNT(DISTINCT o.customer_id)` is
**3** — the distinct non-null customers with orders: 1, 2, 3 (customer 5 is not `NULL`, it
is a value with no parent, and `COUNT(DISTINCT)` does not know that). The general rule:
`COUNT(*)` counts rows, `COUNT(col)` counts rows where `col` is non-`NULL`, and after a
`LEFT JOIN` those are different numbers by exactly the number of unmatched left rows. Getting
this wrong is how "we have 1,240 customers" becomes 1,240 when the answer is 980. Volume 5
owns this trap; the harder variant is `COUNT(DISTINCT)` on a column that can be `NULL`,
where it is neither count of rows nor count of non-nulls.

**T5. `SELECT SUM(o.amount) FROM orders o WHERE o.status = 'CANCELLED'`. There are no cancelled orders. What does it return?** `TRICKY`

One row, containing `NULL`. `SUM` over an empty set is `NULL`, not `0` — SQL's aggregates
follow the empty-relation rule where an aggregate without a `GROUP BY` always produces
exactly one row, and `SUM` of nothing is the identity for addition, which SQL defines as
`NULL` rather than `0`. `COUNT` is the exception and returns `0`, because count of nothing
is genuinely zero. This asymmetry is the bug: a revenue dashboard that does
`SUM(amount)` over an empty result set renders a blank cell rather than `$0.00`, a report
export writes an empty string into a CSV, and a `SUM` in a `HAVING` clause behaves as
`HAVING NULL` which is never true, so the group is dropped rather than shown as zero. The
fix is `COALESCE(SUM(o.amount), 0)` — or `SUM(o.amount) FILTER (WHERE ...)`, which is the
cleaner form and keeps the row shape correct. `AVG`, `MIN` and `MAX` all behave like `SUM`
here.

**T6. You `GROUP BY` on a nullable column. Does the `NULL` rows form a group?** `TRICKY`

Yes, one group, with `NULL` as its grouping value — `GROUP BY` treats `NULL` as a single
non-distinct value rather than as "unknown", for exactly the reason `NOT IN` failed above:
`NULL` is not equal to `NULL`, but two `NULL`s *are* the same group, because grouping is by
`IS NOT DISTINCT FROM` semantics rather than `=`. So `SELECT city, COUNT(*) FROM customers
GROUP BY city` on the seed table returns London 2, Paris 1, and `NULL` 1 — three rows, not
two. This is usually the desired behaviour and it is exactly why a "no city on file"
segment works. The trap is the join: `GROUP BY` on a column that becomes `NULL` because of
a `LEFT JOIN` silently merges "the customer genuinely has no value" with "the customer has
no matching row", which are different facts, and a `NULL` bucket in a report is usually
those two populations added together.

**T7. Three students all score 90. Give the `ROW_NUMBER`, `RANK` and `DENSE_RANK` for
each, ordered by score descending.** `TRICKY`

```sql
SELECT student, score,
       ROW_NUMBER() OVER (ORDER BY score DESC) AS rn,
       RANK()       OVER (ORDER BY score DESC) AS rnk,
       DENSE_RANK() OVER (ORDER BY score DESC) AS drnk
FROM   results;
```

```text
  ┌─────────┬───────┬────┬──────┬───────┐
  │ student │ score │ rn │ rnk  │ drnk  │
  ├─────────┼───────┼────┼──────┼───────┤
  │ Ana     │   95  │  1 │   1  │   1   │
  │ Ben     │   90  │  2 │   2  │   2   │
  │ Cy      │   90  │  3 │   2  │   2   │  ← RANK ties, ROW_NUMBER does not
  │ Dee     │   90  │  4 │   2  │   2  │
  │ Eli     │   80  │  5 │   5  │   3   │  ← DENSE_RANK has no gaps
  └─────────┴───────┴────┴──────┴───────┘
```

`ROW_NUMBER` is arbitrary among ties — which makes it useless for "top 3 per group" if there
are ties, because which of Ben, Cy or Dee you drop is undefined. `RANK` leaves gaps (next
rank is 5, not 4), so `WHERE rnk <= 3` returns 4 rows. `DENSE_RANK` has no gaps. The
practical rule: use `RANK` when ties *should* both be included, `ROW_NUMBER` only when you
need a deterministic tiebreaker, and add an explicit tiebreaker column to the `ORDER BY` if
you need `ROW_NUMBER` to be reproducible.

**T8. `SELECT first_value(status) OVER (ORDER BY id) FROM orders`. The first row of the
output is `'SHIPPED'` (order 11), not `'NEW'` (order 10). Why?** `ADVANCED`

Because the default window frame is not "the whole partition up to the current row" — it is
`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, and for an `ORDER BY` on a **unique**
column, `RANGE ... CURRENT ROW` means *all rows tied with the current row*. That alone
would not break it here, since `id` is unique. The actual cause is that the frame's upper
bound is the current row, so `first_value` should give the frame's first row. What actually
happens is the far more common error in this family: `first_value` *with an explicit
`ORDER BY` inside the function that differs from the window's* — or, more commonly,
developers reaching for `first_value(x) OVER (ORDER BY y)` when they wanted
`last_value(x) OVER (ORDER BY y)`, which returns the current row because the default frame
ends at the current row. The two corrections worth memorising: for last-value semantics use
`last_value(x) OVER (ORDER BY y ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)`,
and for a running total use `SUM(x) OVER (ORDER BY y ROWS UNBOUNDED PRECEDING)`. **Always
name the frame explicitly** — the `RANGE` default is the single most common window-function
bug, because `RANGE` groups tied rows together and `ROWS` does not, so a running total over
a `RANGE` frame sums the whole tie group on the first tied row.

**T9. `SELECT id, total FROM orders WHERE total > 1000 * 0.2;` — what is the error, and
when is a column alias legal in a `SELECT` list?** `TRICKY`

Two separate rules, frequently confused. A column alias defined in the `SELECT` list is
visible in the `ORDER BY` clause in every major engine — that is a `SELECT`-level feature,
because ordering is applied to the result set. It is **not** visible in the `WHERE` clause,
because `WHERE` is evaluated *before* the `SELECT` list is projected, so the alias does not
exist yet at that point. Standard SQL and PostgreSQL reject it; MySQL extends `SELECT`
aliasing into `WHERE` and `HAVING` as a documented non-standard extension, which is exactly
why a query that runs on MySQL fails when you move it to PostgreSQL. `HAVING` is the clause
where an alias *is* standard-legal in most engines, and in PostgreSQL it is the robust place
to filter an aggregate. The right mental model is the evaluation order from Volume 3:
`FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY` → `LIMIT`, and a name is
only in scope from the clause that introduces it.

**T10. Give a query that returns every customer, and their order count, including zero-order
customers — in two different styles, and say which is better.** `TRICKY`

```sql
-- Style 1: LEFT JOIN + GROUP BY (includes Dan with 0)
SELECT c.id, c.name, COUNT(o.id) AS order_count
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.id, c.name;

-- Style 2: correlated scalar subquery (includes Dan with 0)
SELECT c.id, c.name,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
FROM   customers c;

-- Style 3: LEFT JOIN to a pre-aggregated derived table — the fast one
SELECT c.id, c.name, COALESCE(a.n, 0) AS order_count
FROM   customers c
LEFT JOIN (SELECT customer_id, COUNT(*) AS n
           FROM   orders GROUP BY customer_id) a ON a.customer_id = c.id;
```

Note `COUNT(o.id)` in style 1, not `COUNT(*)` — `COUNT(*)` would give Dan 1 instead of 0,
because the outer-joined row still exists. Style 3 is the one to reach for at scale: it
aggregates the fact table once and then joins a small result, instead of grouping over the
join output, and it is the pattern that keeps a "customers with their counts" page fast as
the orders table grows. The correlated subquery in style 2 is the most readable and the
worst at scale — it is a nested-loop aggregate per customer row.

**T11. `UNION` versus `UNION ALL` on two queries each returning 3 rows, one of which
overlaps by 1 row. How many rows, and when does the duplicate cost you?** `TRICKY`

`UNION` returns **5** — it removes the overlap. `UNION ALL` returns **6** — it concatenates
and does nothing else. `UNION` is the default in most dialects, and the reason people write
`UNION ALL` anyway is cost: `UNION` requires a sort or hash of the entire combined result
to deduplicate, which on a large set is a full materialisation, and it is one of the
biggest accidental performance regressions in reporting SQL. The rule is `UNION ALL`
whenever you know the sets are disjoint or duplicates are acceptable, and `DISTINCT` or
`UNION` when they are not. The correctness cases where the default bites: a report that
"counts" rows and silently deduplicates a legitimate duplicate, and a `UNION` of two
`SELECT COUNT(*)`-shaped subqueries that were never meant to overlap. The staff-level
observation is that `UNION`'s cost is proportional to the size of the *output*, not the
inputs, so it is cheap on small dimension tables and ruinous on large fact tables — which
is exactly where teams use it by accident.

**T12. What is three-valued logic, and what do `AND`, `OR` and `NOT` do with it?** `TRICKY`

SQL's `WHERE` uses three-valued logic because a `NULL` means "unknown", not "false". A
comparison against `NULL` — `= NULL`, `<> NULL`, `> 5` — evaluates to `UNKNOWN`, never to
`TRUE` or `FALSE`. `NULL = NULL` is `UNKNOWN` because the value is unknown. The connective
rules are two-valued-looking but not: `TRUE AND UNKNOWN` is `UNKNOWN`, `FALSE AND UNKNOWN`
is **`FALSE`** (a contradiction is settled), `TRUE OR UNKNOWN` is **`TRUE`**, `FALSE OR
UNKNOWN` is `UNKNOWN`, and `NOT UNKNOWN` is `UNKNOWN`. `WHERE` keeps only rows evaluating to
`TRUE`, so `UNKNOWN` rows are dropped — which is why `WHERE city <> 'Paris'` silently drops
Dan, whose city is `NULL`, and why the fix is `WHERE city IS DISTINCT FROM 'Paris'` or
`WHERE city <> 'Paris' OR city IS NULL`. And `NOT IN` is not a connective on your row; it
expands to a conjunction of `<>` comparisons against the subquery result, so a single
`NULL` in that result makes the whole conjunction non-`TRUE` — which is the trap in T2.

**T13. `COALESCE` and `NULLIF` — what do they do, and what are the two real uses?**
`TRICKY`

`COALESCE(a, b, c)` is the SQL-standard form of "return the first non-`NULL` argument", and
it is the fix for the empty-`SUM` problem and for every "no value came back" case in a
report. `NULLIF(a, b)` returns `NULL` when `a = b` and `a` otherwise, and its two real uses
are both about protecting a division: `amount / NULLIF(orders, 0)` prevents a divide-by-zero
error, and it is also how you make a sentinel value into a `NULL` so a unique constraint
ignores it (`UNIQUE` constraints treat `NULL`s as distinct, so `NULLIF(status, '')` lets
every row have an empty status without colliding). The subtle property worth knowing is
that both are `CASE` expressions underneath, and that `COALESCE` on a *correlated* subquery
can defeat an index — a query planner may prefer a sequential scan because it cannot
prove the subquery is not `NULL`, which is a real regression when people "simplify" a
`CASE WHEN EXISTS (...) THEN ... ELSE ... END` into `COALESCE((SELECT ...), 0)`.

**T14. `HAVING` versus `WHERE` — when does each run, and what breaks if you use the wrong
one?** `TRICKY`

`WHERE` filters rows *before* grouping, so it cannot reference an aggregate and it can use
an index; `HAVING` filters *after* grouping, so it can reference aggregate results and
generally cannot use an index for the aggregate itself. The canonical difference:
`WHERE total > 100` removes expensive rows before they are aggregated, while
`HAVING SUM(amount) > 100` computes the sum and then discards whole groups. The performance
consequence is large: filtering 400 million rows down to 4,000 in `WHERE` before an
aggregate makes the aggregate cheap, whereas the same filter in `HAVING` aggregates
everything and throws 99% of it away. Where people get it wrong: applying a filter on the
left table in `HAVING` (it must be in `ON` or `WHERE`, and putting it in `HAVING` after
grouping can change which groups survive), and expecting an alias defined in `SELECT` to be
available — which is standard-legal in `HAVING` and `ORDER BY` but not in `WHERE`.

**T15. `SELECT id FROM orders ORDER BY id FETCH FIRST 3 ROWS ONLY` versus
`... LIMIT 3 OFFSET 900000`. Which is faster, and which one is correct?** `TRICKY`

The `FETCH FIRST` form is faster, because it is a *limit* — the engine can stop after
finding three matching rows. `LIMIT 3 OFFSET 900000` is a *skip*, so the engine must
produce, sort and discard 900,000 rows before it can return three. This is exactly the same
cost model as Elasticsearch's `from`/`size` in Chapter 8, and the reason `max_result_window`
exists in both. Correctness is the other half: `OFFSET` pagination is not stable — if a row
is inserted or deleted between page 1 and page 2, the offset window shifts and you get
duplicated and skipped rows. A keyset predicate is the stable form:

```sql
-- page 2 of a stable keyset pagination, using the seed orders table
SELECT id, status, amount
FROM   orders
WHERE  (status, id) > ('SHIPPED', 11)      -- last (status,id) seen on page 1
ORDER  BY status, id
FETCH FIRST 3 ROWS ONLY;
```

This works because `(status, id)` is a unique, immutable ordering key, and row-comparison
syntax is supported in PostgreSQL and MySQL. The senior addition: keyset pagination needs
an index that supports the sort, and it is genuinely painful for "sort by relevance" where
there is no cursor — which is why scroll cursors or Elasticsearch's `search_after` exist
rather than ever having been an oversight.

**T16. `INSERT INTO orders (id, customer_id) SELECT id + 100, customer_id FROM orders
WHERE status = 'NEW'`. How many rows, and what happens on the second run?** `TRICKY`

Three rows on the first run — orders 10, 12 and 14 are `NEW` — producing ids 110, 112 and
114. On the second run, **nothing happens: a primary key violation.** The newly inserted
rows are themselves `NEW`, so they match the `WHERE`, and the `id + 100` transform maps them
to 210, 212, 214, and *then* onto the rows that already exist. This is the "insert from
self" hazard, and it is a genuinely dangerous production bug because it is deterministic and
it corrupts rather than errors on some engines: if the table has no primary key, or the
target is a non-unique column, there is no error at all and you have silently duplicated
every `NEW` order. The general lesson, worth stating in an interview, is that an
`INSERT ... SELECT` from the table being written to has no snapshot protection against its
own effects in every engine, and the safe forms are to materialise the source set first (a
CTE with a `MATERIALIZED` hint, or a temp table) or to filter on something the insert does
not change.

**T17. `UPDATE orders SET status = 'SHIPPED' WHERE status = 'NEW'`. On a table with 5
million `NEW` rows, what are the practical consequences in a production database?**
`ADVANCED`

Four, in order of severity. (1) **One enormous transaction** — every row locked for the
duration, so a concurrent order for the same customer blocks or times out. (2) **Bloat and
log volume** — under MVCC, an update is delete-plus-insert, so 5 million new row versions
and 5 million dead ones, all of which the WAL must record, and in PostgreSQL the dead
versions cannot be reclaimed until the vacuum runs, which it cannot do while the
transaction is still open. (3) **Replication lag** — the whole 5-million-row change is one
transaction and the replica applies it serially, so reads on the replica fall behind by the
entire duration. (4) **A long lock on the table's pages** in engines where updates touch
every page, which blocks vacuum. The correct shape is batched: update in chunks of 1,000 to
10,000 with a commit between each, driven by a keyset cursor rather than `OFFSET` so
already-updated rows are not re-scanned, and run outside peak hours with a rate limit. The
staff-level version is that this is the same problem as an unindexed batch job in
Microservices Volume 2, and the fix is always "smaller transactions, committed
independently", never "one big transaction, faster".

**T18. What does `SELECT ... FOR UPDATE` do that `SELECT ... FOR UPDATE SKIP LOCKED` does
not, and what is each for?** `ADVANCED`

Plain `FOR UPDATE` takes a row-level exclusive lock on every row the query returns and
**blocks** any other transaction that tries to lock the same rows, so a queue-consumer
pattern deadlocks the whole queue behind the first consumer's transaction. `SKIP LOCKED`
takes the same locks but silently skips rows that are already locked, so each consumer
takes a disjoint batch and nothing waits. That is why `SKIP LOCKED` is the standard
primitive for work queues and job dispatch: it converts a contended lock into a partition
of the work, and it is what lets you run N workers against one table without coordination.
The cost and the trap are the same thing — you have made the queue's fairness into the
database's problem, and a row skipped by `SKIP LOCKED` is not retried, so if the consumer
dies after skipping, the row is only picked up when the *other* transaction commits and
leaves it unlocked. The pattern therefore always needs a visibility timeout or a
reconciliation sweep, and the honest staff-level observation is that a proper queue in
SQS or Kafka removes that failure mode from your code entirely.

**T19. A `DEFAULT` value in a column definition versus a `CHECK` constraint — what is the
difference, and when does one silently not apply?** `ADVANCED`

`DEFAULT` supplies a value when a column is omitted from an `INSERT`, and it is applied
*before* the row is visible to any `CHECK`. So `status TEXT DEFAULT 'NEW' CHECK (status IN
('NEW','SHIPPED','CANCELLED'))` is fine — the default is a legal value. But `DEFAULT 0
CHECK (quantity > 0)` fails on every `INSERT` that omits `quantity`, because the default of
0 is written and then the `CHECK` rejects it. The rule is that a default must itself satisfy
every constraint on the column. The related silent failure: `DEFAULT` does not apply to
`UPDATE`, so adding a column with a default backfills existing rows with that value in
some engines and leaves them `NULL` in others, and whether it is a fast metadata-only
operation or a full table rewrite is a version-specific performance question worth checking
before you run it on a live table. And a `CHECK` is not a substitute for a foreign key — it
cannot see other rows, so `CHECK (customer_id IN (SELECT id FROM customers))` is rejected by
PostgreSQL precisely because it is not enforceable row-by-row.

**T20. A `UNIQUE` constraint and a foreign key — what do they buy you, and what do they
cost at write time?** `TRICKY`

`UNIQUE` gives you a guarantee no application code can bypass, and it costs an index plus a
lookup on every insert and every update of the constrained columns. A foreign key gives you
referential integrity — no orphan rows — and it costs more than people expect: on insert it
is a probe into the parent index, on delete of a parent it is either a `RESTRICT` (default —
the delete fails) or a `CASCADE` / `SET NULL` / `SET DEFAULT`, and on update of the parent's
key it is a cascade across every child row. That cascade is the expensive one: a
foreign key on `(customer_id, customer_id)` where the parent key can be updated turns one
`UPDATE` into a bulk rewrite of the child table, inside one transaction, while holding
locks. The engineering practice that falls out is: put foreign keys on, because the
guarantee is worth more than the write cost at almost every write volume people actually
have; make parent keys **immutable** (natural keys or surrogate keys that never `UPDATE`) so
the cascade path is unreachable; and use `ON DELETE CASCADE` only where a deliberate
data-destruction policy has been agreed, not as a default. Volume 2 owns the `CHECK` and
`DEFAULT` mechanics; Volume 6 owns the relationship modelling.

**T21. You have `id INT GENERATED ALWAYS AS IDENTITY` and a failed `INSERT` leaves gaps in
the sequence. Is that a bug?** `TRICKY`

No, and it is worth explaining precisely because people chase it. Identity sequences are
not transactional — the counter increments on allocation, not on commit — so a rollback, a
constraint violation, or a failed statement still consumes values. Gaps are unavoidable
and by design: making the sequence transactional would require serialising every insert on
a single row lock, which destroys the throughput the feature exists to provide. The
consequences you must design around: never treat an identity value as a count ("the highest
id is 41,203 so we have 41,203 rows" is wrong), never expose it as a business number
(invoice numbers, account numbers and SKUs need a gapless or human-meaningful sequence,
which is a separate concern with a separate table), and remember that a sequence is not
monotonic in commit order — a transaction that allocated id 100 may commit after one that
allocated id 101, so `ORDER BY id` is not `ORDER BY insertion time` under concurrency. That
last one is the finding that produces real bugs when someone uses ids for change-data-capture
ordering.

**T22. `SELECT DISTINCT status FROM orders` — what does the engine have to do, and when is
`DISTINCT` a symptom of a modelling mistake?** `ADVANCED`

It has to either hash or sort the whole result to eliminate duplicates, so `DISTINCT` is an
aggregation over the entire set — and it also forces the query to lose ordering guarantees
unless you add an `ORDER BY`, because the deduplication step is unordered. It is also
frequently avoidable: if the query is `SELECT DISTINCT status FROM orders WHERE
customer_id = 5` and there is a composite index on `(customer_id, status)`, an
**index-only skip scan** or a loose index scan can walk the distinct values of the second
column without touching the table, turning a full aggregation into a short index walk —
PostgreSQL has a loose index scan extension and MySQL 8 has skip-scan, so this is worth
checking. The modelling point is more important than the tuning: `DISTINCT` in a
`GROUP BY`-free query usually means the query is asking "what are the valid values of this
field", which is a *schema* question. If the answer matters, it belongs in a lookup table
or an enum, which makes it enforceable with a foreign key, gives it a display label, and
lets you rename values without a data migration. `DISTINCT` on a free-text or
high-cardinality column is the real performance trap: it is a full sort or hash of
millions of distinct values for a result the UI throws away.

**T23. `SELECT * FROM orders o WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.city = 'London')`. Rewrite it as a
join. Is the rewrite always equivalent?** `TRICKY`

```sql
SELECT o.* FROM orders o
JOIN   customers c ON c.id = o.customer_id
WHERE  c.city = 'London';
```

They are equivalent here because the subquery is a semi-join: it filters `orders` without
adding columns or rows, and since `c.id` is a primary key the join cannot fan out. The
conditions under which the rewrite changes the result are worth knowing, because this is a
review question rather than a style question. The join is an **inner join** and the
semi-join is not, so they agree only because the join condition is on a unique key. Join
`on c.city = o.city` instead and the join fans out, one `orders` row per matching customer,
and `o.*` comes back duplicated. The other divergence: if the subquery could match multiple
rows, `EXISTS` still returns the outer row once and the join returns it many times — which
is the fan-out bug in a different costume. `EXISTS` and `IN` are both semi-joins;
`JOIN` is an equi-join, and the planner will convert the first into something like the
second when it is safe, which is why the SQL form you write does not always determine the
plan.

**T24. `WHERE ts >= '2026-01-01' AND ts < '2026-02-01'` on a `timestamptz` column. What is
wrong with it and why does the right form matter?** `TRICKY`

Three things, and each bites. (1) **Timezone**: comparing a `timestamptz` to a string
without an offset makes the string a `timestamp` in the session time zone, so the same
query returns different rows for a user in London and one in Mumbai, and the bug only
appears in production. Always write `timestamptz '2026-01-01 00:00:00+00'`. (2) **The
half-open interval**: `>= start AND < end` is correct and is what you want, because
`BETWEEN` is inclusive on both ends and will include midnight of the *next* day in a
timestamp column. (3) **Index usability**: this is the one with the performance teeth.
Sargable predicates — a bare column compared to a constant or a parameter — can use an index
range scan. `WHERE EXTRACT(YEAR FROM ts) = 2026` or `WHERE ts::date = '2026-01-01'` or
`WHERE DATE(ts) BETWEEN ...` wrap the column in a function, and a normal B+ tree index
stores the column values, not the function results, so the index cannot be used and the
query degrades to a sequential scan. The fix is a generated column with an index on it, or
an expression index (`CREATE INDEX ON orders (date_trunc('day', ts))`), or range predicates.
The trap is that a timestamp range index has terrible selectivity on its own, so on a
high-volume table you want a composite index leading with the timestamp.

**T25. `CREATE INDEX idx ON orders (customer_id)` on a table where 95% of rows have
`customer_id` non-null. Is it useful, and what would you build instead?** `STAFF`

It is nearly useless for the usual reason people get burned by low-selectivity indexes: a
B+ tree on a column where almost every value exists walks the tree to find qualifying
rows, and finds 95% of the table, so the optimiser will prefer a sequential scan and the
index is write overhead with no read benefit — every insert now maintains it. What makes a
selectivity estimate unreliable is worth knowing too: the planner has a *sample* of the
table's statistics, so an index that was selective when it was created can become useless
after a data change, and the index does not update its own statistics. The right move is
usually a **composite** index leading with a more selective column, or a partial index
restricted to the rows that matter (`CREATE INDEX ... ON orders (customer_id) WHERE status
= 'SHIPPED'`), or a covering index that includes the columns the query needs. The staff-level
framing: the question to ask of every index is "which query does this exist for, and what
plan does it change?" — an index with no named query behind it is pure write amplification
that someone will have to analyse to justify before it is ever a bottleneck.

**D1. We have a `customers` table and a `orders` table, and every order page on the site
is slow. Walk me through how you would find out whether the problem is the schema, the
indexes, or the query — in that order.** `STAFF`

In that order, and the order is the argument: the schema determines what the query *can* be,
the indexes determine what plan it gets, and the query determines what work the plan does.
Schema first: is the page's grain right, and is it a join fan-out or a pagination problem?
Pull the actual query and the actual plan, because "every order page" may be three different
queries with three different problems. Then indexes: `EXPLAIN (ANALYZE, BUFFERS)` on the
real query with real parameters, looking specifically at the gap between estimated and actual
rows (a 100× estimate error means stale statistics or correlated columns, and it is the
single most common cause of a bad plan), and at whether the plan is a nested loop over a
large outer relation when a hash join was intended. Then the query: is the pagination
`OFFSET`-based, is it `SELECT *`, is there an `N+1` from an ORM, is the sort avoidable. I
would insist on this sequence because each step is cheaper than the next and because
skipping to "add an index" is the reflex that produces a dozen indexes and no improvement.
And I would finish by asking the question the whole sequence is aimed at: **is this page
doing a work it should not be doing at all?** — a count of all orders for a customer, a
search over unindexed free text, a `DISTINCT` on a high-cardinality column.

**D2. A teammate wants to denormalise `customer_name` onto `orders` for performance. You are
not convinced. What is the argument, and what would change your mind?** `STAFF`

The argument is that the change trades a consistency problem the database already solves —
a single source of truth, updated in one transaction — for one you now have to solve across
a trigger, an application code path, or a CDC pipeline, and that the second kind of problem
is strictly harder because it has more failure modes and no transactional rollback. The
concrete costs: every path that writes an `orders` row must also write the name, and
"every path" includes bulk loads, backfills, the admin repair tool, and the one service
written last year by someone who left. A rename becomes a data migration. And the win is
avoiding a join, which is cheap — a nested-loop join against a unique key is an index
probe per row. What would change my mind is all three of: a measured plan showing the join
is the bottleneck and not the pagination or the sort, a specific rewrite (a covering index
that makes the join index-only, or a denormalised *read model* rather than a denormalised
*table*) that gets the same latency, and a named mechanism for keeping the copy consistent.
The framing that usually wins the review: the same denormalisation is available as a
materialized view or a projection with a refresh interval, which gets the read latency
without letting three writers maintain a column.

**D3. A report joins `orders` to `line_items` to `products`, aggregates, and returns revenue
that is 3.4× too high. What is the bug, how do you prove it, and how do you fix it?**
`STAFF`

The bug is grain. The report mixes an order-level fact (`orders.amount`, or a count of
orders) with a line-level fact (`line_items.quantity × price`) and aggregates after the
join, so the result has one row per *line*, not per order, and any order-level measure is
multiplied by the average lines-per-order. Prove it before fixing it: compute
`COUNT(DISTINCT o.id)` versus `COUNT(*)` in the same query — if they differ by roughly the
multiplier, it is fan-out. Fix it by aggregating the line-level table to the grain you need
*before* joining, in a CTE or derived table:

```sql
WITH line_totals AS (
  SELECT order_id, SUM(quantity * unit_price) AS line_total
  FROM   line_items
  GROUP  BY order_id
)
SELECT o.id, o.created_at, o.amount AS header_amount,
       COALESCE(lt.line_total, 0) AS computed_total
FROM   orders o
LEFT JOIN line_totals lt ON lt.order_id = o.id
WHERE  o.created_at >= DATE '2026-01-01';
```

`SUM(DISTINCT ...)` is the detective tool, not the fix — it is wrong whenever two lines
genuinely have the same amount. And the prevention is one line in the schema documentation:
state the grain of every table in a comment. Every double-counting bug in production is a
grain bug that nobody wrote down.

**D4. You have 400 million rows and a 90-second p99 on one report. Walk me through what you
would do in order, and tell me which step is the one that is hard to undo.** `STAFF`

In order, and the order is the point: (1) **measure** — `EXPLAIN (ANALYZE, BUFFERS)`, the
real query with real parameters, because "90 seconds" is a symptom and the cause might be a
stale statistic, a missing index, or a `DISTINCT` on a high-cardinality column. (2) **index**
the access pattern the query implies, if one is missing — a day of work. (3) **fix the
statistics** if they are stale, or reduce the estimation error with extended statistics —
hours. (4) **make it index-only** with a covering index, accepting write amplification.
(5) **materialise** the result — a materialized view on a refresh schedule, or a cached
projection — accepting a staleness bound. (6) **isolate** it: a read replica dedicated to
reporting, so the report stops competing with OLTP. Only then, (7) **partition** the table
by a date range so the query prunes.
**The step that is hard to undo is step 7, and specifically the partition key**, because it
becomes part of every future query, every maintenance window, and every future constraint,
and changing it later means moving data under load. Steps 2 to 5 are all cheap to abandon —
you can drop an index or a view in a second. A read replica is nearly as cheap to reverse.
The reason to insist on the sequence is that the cheap steps frequently make the expensive
one unnecessary, and a partitioning project undertaken on an estimate rather than on a plan
is a multi-week commitment to an answer you have not verified.

**D5. A 400 GB table has 12 indexes. The write path is the bottleneck. What do you do, and
what is the correct order?** `STAFF`

Measure first, and measure per index, because the reflex is to drop indexes and drop the
wrong ones. The correct order: (1) find the actual write cost — the difference between WAL
volume with and without a given index, or in PostgreSQL the `pg_stat_user_indexes` scan
counters, which tell you which indexes have *never* been read; (2) drop the indexes no query
uses, which is nearly free and is the largest single win available; (3) for the indexes that
are used, look for overlap — a composite `(a, b, c)` makes `(a)` and `(b)` largely redundant
because of the leftmost-prefix rule, so consolidating three indexes into one saves two index
maintenance passes per write; (4) for the remainder, consider whether a **partial** index on
the subset the queries actually filter covers the use case at a fraction of the write cost;
(5) consider `INCLUDE` covering columns versus separate indexes for frequently-sorted
columns; and only then consider anything structural. The trap in step 2 is dropping an index
whose only job is enforcing a `UNIQUE` constraint, or one that exists to make a foreign-key
check an index probe rather than a scan — you will not find those in scan statistics. The
staff-level framing is that every index is a standing tax on every write paid for a specific
read, and a periodic review of unused indexes is a routine operational task, not a
one-off cleanup.

**D6. We need to support three new queries against a 90-million-row table and we are not
allowed to change the schema. What are your options, ranked?** `STAFF`

Ranked by reversibility and by cost, and I would present them in this order deliberately. (1)
**Add the indexes that answer the queries directly** — not allowed if the schema is frozen,
but if the freeze means "no column changes", indexes are frequently still permitted, and
this is the cheapest correct answer by a wide margin, so it is worth checking what the
freeze actually covers. (2) **A materialized view** holding exactly the shape the three
queries need, refreshed on a schedule — reversible, with an explicit staleness bound, and it
costs storage and a refresh window. (3) **A dedicated read replica** with its own
indexes, so the reporting load and the reporting indexes are both off the primary — this is
the answer for "our OLTP is paying for the reports' indexes". (4) **An Elasticsearch index**
over the same data, if the new queries are search-shaped rather than relational — accepting
that it is a derived copy with its own staleness contract. (5) **A pre-aggregated rollup
table** maintained incrementally, if the queries are all "totals per period", accepting the
incremental maintenance as a consistency mechanism you now own. What I would *not* do first
is rewrite the queries into something the existing indexes serve, because that is the right
answer and it costs nothing, and the "we can't change the schema" framing usually means "we
don't want to think about which queries we are actually running" more than it means a
genuine constraint.

**D7. `SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT 20` takes
2.4 seconds at p99 on 200 million rows. You may add indexes but not change the query. What
is the index, and what else would you check?** `STAFF`

`(user_id, created_at DESC)` — user first, because it is the equality predicate, then the
sort column in sort order, so the index serves both the filter and the ordering with no sort
step and no scan past the first 20 matches. That is the textbook answer and it is right.
What I would check beyond it, because an index alone frequently does not fix a p99: the
**distribution** of `user_id` (a handful of power users with millions of rows each will
still be slow, and for them the index depth and the number of heap fetches dominate), the
**heap fetches** count in the plan — if the index is not covering, every one of the 20
returned rows is a random page read, and adding the selected columns to the index as `INCLUDE`
payload makes it index-only; **selectivity**: if the average user has 200 rows, a full
index scan of that user's rows may genuinely be cheaper than a seek, and the planner's
choice may be right; and the **plan cache**: a p99 that is fine at p50 frequently means a
different plan is being chosen under different parameter values, which is a prepared
statement or a plan-stability problem rather than a missing-index problem. Adding the
selected columns to cover the query is the step most people skip, and it is often the one
that turns 2.4 seconds into 20 milliseconds.

**D8. We have a primary with 4 read replicas and p99 read latency is still bad. What is on
your list?** `ADVANCED`

In this order, and the first two are almost always the answer. (1) **Is the query hitting
the primary?** A connection pool that is not read-aware sends everything to the primary, and
"we have replicas" is a configuration that exists in the architecture diagram and not in
the connection string. (2) **Is the slow query a scan on all replicas?** A query that the
replicas can serve badly serves badly 5 times. (3) **Is the replica actually current?**
A lagging replica behind a write-heavy primary is both slow to serve recent data and a
latency risk for anything that needs read-your-writes, and forcing reads to the primary
under lag is a common emergency response that makes the primary problem worse. (4) **Is
replica CPU saturated?** Replicas serve reads *and* apply the WAL, so a read-heavy workload
starves the apply thread and creates lag, which then causes more primary reads — a positive
feedback loop that looks like a latency problem and is a capacity problem. (5) **Connection
pool exhaustion** on the replica side, where requests queue for a connection rather than for
data. (6) **Cross-region latency** if the replicas are not actually co-located. (7) Only
then, the query itself. The staff-level point: replicas scale reads, and they introduce a
consistency model and a lag problem, so the design question is which reads may go to a
replica — not how many replicas to add.

### Indexing & Query Performance

**T26. You add an index on `(status, created_at)`. Which queries does it serve, and which
does it not?** `TRICKY`

The leftmost-prefix rule: it serves `WHERE status = 'SHIPPED'`, `WHERE status = 'SHIPPED'
AND created_at > X`, and — because the second column is a range in the index — `WHERE
status IN ('SHIPPED','NEW') AND created_at BETWEEN ...`. It does **not** serve
`WHERE created_at > X` alone (no leading column constrained, so there is no prefix to seek
on), and it does not efficiently serve `WHERE created_at > X AND status = 'SHIPPED'` where
the planner might choose to lead with the range. That last point is a real subtlety: once a
column in a composite index is used with a *range* predicate, columns to its right cannot
narrow the seek further and are only useful for filtering within the range. The practical
consequence for index design is that the leading column should be the one you filter on with
equality, in selectivity order, and range predicates go last. `CREATE INDEX ... (a)`, then
`(a, b)`, then `(a, b, c)` is a strict superset chain for the equality-only case, which is
why "one index with all the columns" is usually the wrong instinct and "the exact composite
in the shape of one query" is usually right.

**T27. A composite index `(a, b, c)` exists. Does it also serve `WHERE a = 1 AND c = 3`?**
`TRICKY`

Yes, but with a caveat that matters in practice. The index can seek to `a = 1` using the
leftmost prefix, and then `c = 3` is a filter applied to the entries within that range —
it just cannot narrow the seek itself, because `b` is unconstrained. Whether the index is
*used* at all is then a cost decision: if `(a=1)` matches a large fraction of the table, the
planner will prefer a sequential scan, and the index correctly is not used. So the honest
answer is "it is available but not efficient, and the optimiser will usually reject it when
`a` is not selective." This is the trap behind "why isn't my composite index being used":
the index is not broken, the planner has correctly concluded that scanning beats seeking,
which almost always means the leading column's selectivity is the problem rather than the
index. The fix is either to reorder the columns so the selective one leads, or to add a
partial/filtered index for the specific shape.

**T28. What is an index-only scan, and why does it not always happen?** `ADVANCED`

It is a scan that answers the entire query from the index, with no heap access — every
referenced column is present in the index. It is the single largest available speedup for
read-heavy OLTP, because it converts random page reads into a sequential walk of a
narrower structure. It does not happen when a selected column is not in the index, when
the query needs a column only present in the heap, or — the one people miss — when the
visibility map says the page might contain a row version that is not yet visible to this
transaction, which in PostgreSQL happens on any page with a recent update. That last
condition is why index-only scans on frequently-updated tables degrade over time, and it is
the connection to Volume 7's bloat and HOT-update material: a table whose pages stop being
all-visible stops getting index-only scans, and reads that were free start re-fetching the
heap. The remedy is more than a wider index: it is a vacuum cadence that keeps the
visibility map current. In MySQL the equivalent is a covering index and the clustered-index
leaf holding the row, so "index-only" there means the secondary index already contains
everything.

**T29. Why did adding an index make a write-heavy table *slower*, and by how much?**
`ADVANCED`

Because every insert, update and delete must now also insert, update and delete index
entries — and a B+ tree update is not a single append, it is a page read, an in-place
modification, a possible page split, and a WAL entry. With 12 indexes that is 13 structures
to maintain per row, each with its own page pressure, its own eviction from the buffer
pool, and its own share of the random-I/O budget. The `UPDATE` case is the expensive one,
because a B+ tree update is often a delete plus an insert, so a single `UPDATE status` can
produce a physical delete and insert in the index. In a WAL-based engine this shows up as
WAL volume growth proportional to the number of indexes — so a bulk load into a table with
twelve indexes can be several times slower than the same load into the table without them.
The measurement to make is the ratio of index bytes to heap bytes, and the decision rule is
that an index must have a named query behind it: a 40 GB index on a 4 GB table earning
nothing is a tax with no beneficiary.

**S1. A PR adds `CREATE INDEX CONCURRENTLY` in a migration that runs in a transaction.
What is wrong and what happens?** `ADVANCED`

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, and that is by design:
the non-concurrent form takes a `SHARE` lock on the table for the whole build, which blocks
writes; the concurrent form builds the index in two passes and takes locks only briefly at
the start and end, so it does not block writes but is invalid and unusable if it fails
partway — it leaves an `INVALID` index that still costs write amplification on every
subsequent insert but cannot be used by the planner. So the review comment has three parts:
move the statement out of the migration's transaction (many migration frameworks wrap
everything, which is a framework-level problem worth flagging), add a guard that checks for
and drops an existing invalid index before rebuilding, and add the validation step
(`pg_index.indisvalid`) to CI or to the migration's own verification, because a silently
invalid index is one of the worst failure modes in the set — it is invisible in
`\d`, invisible to the planner, and costs you on every write forever.

**S2. A query is `SELECT * FROM orders WHERE customer_id = 5 ORDER BY created_at DESC LIMIT
20`, the table is 200 million rows, and the plan is a sequential scan with a top-N sort. The
PK is on `id`. What is the review comment?** `TRICKY`

Two missing pieces and one wrong one. Missing: an index on `(customer_id, created_at DESC)`
— customer first because it is the equality, created_at in sort order so the `ORDER BY` is
satisfied by the index and the sort disappears entirely, which turns a full scan plus a
200-million-row sort into a seek plus 20 row reads. Missing: `SELECT *` forces a heap fetch
for every row, so even with the index this is 20 random page reads; selecting only the
columns needed, or making the index covering with `INCLUDE`, removes them. Wrong: the `LIMIT`
does not help the scan, because a sequential scan with a top-N heapsort must still examine
every row to know it has found the 20 best — a `LIMIT` is not a stopping condition for a
scan, it is a result-set size. The review comment should also ask for the plan *with real
statistics* — a sequential scan on a selective predicate usually means stale statistics or
correlated columns, not a missing index, and adding an index on top of a mis-estimate leaves
you with an unused index.

**S3. A teammate has added six indexes this month. Review the change and decide.**
`STAFF`

The review method matters more than the verdict. First, for each index, ask for the query
it exists for; an index with no named query is rejected, not discussed. Second, check for
overlap with existing composite indexes — the leftmost-prefix rule means a new `(a, b)` is
usually redundant given an existing `(a, b, c)`, and the correct answer is frequently "extend
the existing index" rather than "add another". Third, look for an index that duplicates a
`UNIQUE` constraint, since the constraint already creates one. Fourth, ask about the write
cost on the hot path, in numbers: index bytes against heap bytes, and how many of the
indexes are on columns that appear in the top three statements of the write workload. Fifth,
flag the missing `IF NOT EXISTS` and the missing concurrent build. The verdict I would aim
for is not "delete them all" but "consolidate to the two or three indexes that the
`EXPLAIN` plans show are used, and add the rest to a review process", because the real
finding is usually that nobody owns index lifecycle and the default state is accretion.

**P1. Yesterday's deploy added a column and an index. Today p99 writes are 3× worse and the
replica lag alarm fired. Walk me through the investigation.** `SCENARIO`

Start with **the correlation, and check it honestly** — one deploy, one change, but also
check whether the deploy changed the write volume or the row size, since a wide row makes
every page split and every secondary index entry larger. Then **WAL volume**: in
PostgreSQL, compare `pg_current_wal_lsn()` deltas over a fixed window against yesterday's;
in InnoDB, checkpoint write volume and the history list length. An index build on a hot
table produces a large one-off WAL burst, and if it ran in the same window as the regression
you may be chasing the build rather than the index. Then **the new index's own cost**: is
the new column indexed, is the index on a high-cardinality column with a poor fill factor, and
is the insert pattern sequential or random — a random-order secondary index causes a page
split on nearly every insert. Then **replica lag specifically**: a `CREATE INDEX` runs once
on the primary but the *maintenance* cost is permanent, and if the index is not needed for
any read, the correct action is to drop it concurrently and confirm lag recovers. Finally
check for the boring causes you should not skip: autovacuum falling behind on the new
column's statistics, and a plan change on a read that now competes for the same resources.
The prevention is to run index changes as a separate, measured step — and to check the
WAL-rate impact of an index in staging against a production-shaped row count, not a
thousand-row sample.

**P2. `EXPLAIN` says 1,200 rows, the query returns 3 million. What is going on and what do
you do?** `TRICKY`

A severe estimation error, and it is the root cause of most bad plans — the planner chose a
nested loop or a bad join order based on believing the intermediate was small. The causes,
in order of likelihood: **stale statistics** (the most common by far, and the cheapest to
fix — `ANALYZE`, and for PostgreSQL raise the statistics target on the offending columns with
`ALTER TABLE ... ALTER COLUMN ... SET STATISTICS 500`); **correlated columns**, where two
columns are functionally dependent in a way the planner assumes is independent (a
`customer_id` and a `customer_plan` are correlated, and a naive estimate multiplies
selectivities, giving a number off by orders of magnitude — PostgreSQL's extended statistics
feature exists for exactly this); **non-equality predicates on a range**, where a
histogram-based estimate is a range interpolation and outliers break it; and **a stale or
sampled statistic on a skewed distribution**, where 5% of the keys hold 95% of the rows and
a sample of 30,000 rows misses the hot key entirely. The diagnostic is to compare the
estimate and the actual at *each* node of the plan and find where the divergence starts —
that node is the culprit, not the top. The fixes map to the causes: re-analyze, raise the
statistics target, create extended/multivariate statistics for the correlated pair, or
change the predicate so it becomes sargable.

**P3. Our dashboard's slowest query is a `GROUP BY` over 300 million rows and we cannot
change the query — it is in a BI tool. What can we do?** `STAFF`

Three things, and the second is usually the answer. First, check what the BI tool is
actually sending — many tools generate a subquery per filter or wrap your query in a
`LEFT JOIN` against a dimension table, and the "simple" query in the log is not the query
that runs. Second, and usually the biggest win: a **materialized view** or incremental
aggregate table holding exactly the grouped result, refreshed on a schedule, with the
staleness bound written down and a report on how stale it currently is. The BI tool then
reads a small table, and the expensive aggregation happens once per refresh instead of once
per dashboard load. Third, ensure the underlying table is **partitioned** by whatever the
`GROUP BY` time range covers, so a query filtered to "last 7 days" prunes to a few
partitions rather than scanning 300 million rows. Fourth, a **read replica** dedicated to
the BI tool so the dashboard's scans stop competing with OLTP for buffer pool and I/O — this
is the least invasive change and the one that most often removes the p99 problem entirely.
The staff-level framing: a query you cannot change still has things you can change around
it, and "the BI tool owns the SQL" is a constraint to design for rather than a reason to
give up.

**T30. Your table has a b-tree on `email`. A query does `WHERE UPPER(email) = $1`. Why is
it slow, and what are the two fixes?** `TRICKY`

Because `UPPER(email)` is a function of the column, not the column itself, so the index on
`email` cannot be seeked — the engine must evaluate the function on every row and compare.
A normal B+ tree stores the raw column values, not the function results, so there is
nothing to look up. The two fixes, in order of preference. **Expression index**: index the
expression, and the query will match it —
`CREATE INDEX ON users ((UPPER(email)))` in PostgreSQL,
`CREATE INDEX idx_upper_email ON users (UPPER(email))` in MySQL. **Functional index on a
generated/stored column**: add `email_upper TEXT GENERATED ALWAYS AS (UPPER(email)) STORED`
with an index on it, which has the advantage of being inspectable and usable by more query
planners. The thing to *avoid* is adding a plain `upper_email` column and maintaining it in
application code, because that is a denormalisation with a consistency cost and a migration,
and the database can do it for free. The general rule is the one from T24: the index must
be on the expression you are actually comparing against.

**T31. When would a hash index, a BRIN index, or a full-text index be the right choice
over a B+ tree?** `ADVANCED`

Each exists because a B+ tree is the wrong structure for a specific shape, and being able
to name the shape is the point. **Hash** is equality-only and can be smaller and faster than
a B+ tree for pure `=` lookups, but it cannot sort, cannot range-scan, and cannot support
`ORDER BY` — in PostgreSQL it is worth considering for very wide, low-cardinality-equality
columns, though B+ trees have closed most of the gap. **BRIN** is the interesting one: it
stores *block ranges* — a min and max per page-range — so it is tiny, index creation is
near-instant, but it only helps when physical row order correlates with the indexed column.
That is exactly the case for an append-only table indexed by `created_at`, where the index
can eliminate 99% of the heap with a few kilobytes, and it is the wrong index for a
randomly-ordered table, where it is useless. **Full-text / inverted** (PostgreSQL's
`GIN`/`GiST` on `tsvector`) is for `MATCH` and ranking, not equality. **Bitmap** indexes
(PostgreSQL) are for low-cardinality columns in a data warehouse, where many single-column
bitmaps are combined before the heap is touched. The interview answer is: the default is a
B+ tree because it handles the widest set of access patterns, and each of these exists
because your access pattern is narrower than that.

**D12. Your p99 on the primary is 400 ms and the p50 is 4 ms. Replicas are at 380 ms. What
does that shape tell you, and where do you look?** `STAFF`

That shape — a healthy p50 with a catastrophic tail, identical on every replica — almost
never means the plan is wrong, because a bad plan hurts the whole distribution. It means a
*minority* of executions are slow, and the candidates are: a different plan being chosen
for particular parameter values (plan cache / prepared statement instability, or a
generic plan chosen because the planner saw too many distinct values); lock waits or
lock-timeout retries; a checkpoint or WAL spike catching part of the requests; connection
pool queueing (requests waiting for a connection, which is a *queueing* p99 not a query
p99, and it is the single most common cause of a healthy p50 with a bad p99); IO saturation
on a subset of the data, so a hot range is slow and the rest is fast; or a hot row or hot
index entry that every transaction contends on. The diagnostic that separates them: look at
the *query text* of the slow requests, not just their duration — if they are one parameter
shape, it is the plan; if they are one connection pool, it is queueing; if they are one
`UPDATE` target, it is lock contention. And the fact that the replicas show the same tail
tells you it is not a replication artifact and not a primary-only lock, which eliminates
half the list immediately.

**D13. A `JOIN` across 10 tables is slow. What is happening and what do you do?** `ADVANCED`

Three things, and the third is the real answer. First, the search space: join order across
*n* tables is *n*!, and past roughly 8 to 10 tables even a good planner's exhaustive dynamic
programming over "interesting" orderings stops being tractable, so it falls back to
heuristics and the plan quality degrades. Second, the intermediate sizes: a chain of joins
without a filter can explode multiplicatively, and a planner that mis-estimates one
intermediate picks a bad algorithm for everything downstream. Third, and this is the
staff-level point: **a join across ten tables is almost always a schema problem wearing a
query costume.** Ten tables in one query usually means the query is traversing a
relationship graph the model did not intend — an ORM's default eager-loading of a deep
graph, a view that nobody looked at in three years, or a reporting query that has
accumulated joins. The fix that gets the most leverage is a denormalised bridge or a
materialized view that flattens the graph, because that both shortens the join chain and
removes the intermediate-size problem; a denormalised read model is the right answer and
a query hint is not. The mechanical fixes, in order, are: reduce the join count, add
selective predicates early so the planner can prune, add the foreign-key indexes so each
join is an index probe rather than a hash build, and check the statistics for estimation
error at each node.

**D14. How would you approach indexing a table you have never seen, in a production
system, with no ability to change queries?** `STAFF`

Measurement first, and never guess. (1) Pull the actual statement log — the real queries, by
frequency and by total time, not the ones the code review suggests. (2) For each, look at
the current plan and the estimated-versus-actual gap. (3) Identify which columns appear in
equality predicates, range predicates, join conditions and sort orders, because those are
the four roles an index column can play and the ordering within a composite index follows
from the roles: equalities first (most selective leading), then the sort key, then range and
included payload columns. (4) Check existing indexes for prefix redundancy before adding
anything, and check the `UNIQUE` constraints and foreign keys, which may have created
indexes nobody knows about. (5) Size the write impact before shipping: index bytes against
heap bytes, and the WAL cost of maintaining each one on the busiest insert path. (6) Ship
one or two, `CONCURRENTLY`, and measure. (7) Then set up a standing review — an unused-index
report, and a slow-query alert — because the state you are fixing here is the default
state, and the fix decays. The trap to avoid is shipping all six candidate indexes at once
and then being unable to attribute the regression to any of them.

### Transactions & Concurrency

The seed data for this section, and the interleavings are shown the way they happen:

```text
  accounts
  ┌────┬────────┬─────────┐
  │ id │ owner  │ balance │
  ├────┼────────┼─────────┤
  │  1 │ alice  │   100.0 │
  │  2 │ bob    │   100.0 │
  └────┴────────┴─────────┘
```

**T32. T1 and T2 both read `balance` for account 1 (100.0). T1 writes 80.0. T2 writes 70.0.
Both commit. What is the final balance, and what is this called?** `TRICKY`

70.0, and it is a **lost update**. T1's write of 80.0 is silently overwritten by T2's write
of 70.0, because T2 read the balance before T1 committed and then wrote a value derived
from that stale read. The value 80.0 never existed in the final state, and no constraint
was violated, so nothing detected it. This is the canonical lost update, and it is the one
of the six anomalies that MVCC-based `REPEATABLE READ` does **not** prevent by itself — under
MVCC, T2's update does take a row lock, but it is applied to the *new* version of the row
without re-checking that its read was still current, so the update succeeds and the write
is lost. The fixes are three: an explicit `SELECT ... FOR UPDATE` on the read, so T2 blocks
until T1 commits and then re-reads; an atomic in-place update —
`UPDATE accounts SET balance = balance - 30 WHERE id = 1`, which needs no read at all and is
the correct answer in almost every case; or optimistic concurrency with a version column
and a `WHERE version = ?` on the update, which detects the conflict rather than preventing
it. The atomic update is the one to reach for, and the reason it wins is that it removes the
read from the critical section entirely.

**T33. Under `READ COMMITTED`, T1 does `UPDATE accounts SET balance = balance - 30 WHERE
id = 1` (not yet committed). T2 does the same statement for the same row. What does T2
see, and when?** `ADVANCED`

T2 **blocks**. In any engine, an `UPDATE` of a row version takes an exclusive lock on that
version, so T2 cannot modify it until T1 commits or rolls back. What differs by isolation
level is what T2 does *after* it unblocks, and that is where `READ COMMITTED` and
`REPEATABLE READ` diverge sharply.

- Under **`READ COMMITTED`**, each *statement* takes a fresh snapshot. So when T2 unblocks
  after T1 commits, T2's `balance = balance - 30` is re-evaluated against the newly
  committed value of 70.0, and the result is 40.0. T2 sees T1's write.
- Under **`REPEATABLE READ`** (MySQL InnoDB, and PostgreSQL's `SERIALIZABLE`), the
  snapshot is fixed for the whole transaction. T2's UPDATE reads the *old* version (100.0),
  computes 70.0, and then discovers the row version it wanted to update has changed — so it
  takes the next version, applies 70.0 to it, and the result is **70.0**: T1's decrement of
  30 is lost. This is the single most important behavioural difference between the two
  levels, it is why applications written against `READ COMMITTED` behave differently on
  MySQL's default, and it is why "what is MySQL's default isolation level" (`REPEATABLE
  READ`) and "does that mean I get repeatable reads" are not the same conversation.

**T34. Under `REPEATABLE READ`, T1 reads `balance = 100` for account 1 and holds the
transaction open. T2 sets that balance to 50 and commits. What does T1 see when it reads
again?** `TRICKY`

**100**, not 50. `REPEATABLE READ` guarantees a repeatable read within a transaction, so T1
reads from the same snapshot. The consequence is the anomaly nobody expects on first
contact: **read skew**. A transaction that reads row A, then row B, can see B's new value
and A's old value simultaneously, even though no single instant of time had that
combination. Here it is concrete: T1 reads the balance (100, old) and then reads a
transaction log for that account and sees the row recording the update to 50 — so T1 has
simultaneously concluded "balance is 100" and "the balance was set to 50", and any decision
made from those two reads is wrong. The point to make in an interview is that snapshot
isolation prevents *dirty* and *non-repeatable* reads but does **not** make the transaction
serialisable, because the snapshot is not a serial order. If T1's logic is "if balance is
100 then allow the withdrawal", read skew is a correctness bug, and the fixes are to put both
reads under `SERIALIZABLE`, or — far better — to make the check and the action a single
atomic statement, which removes the window entirely.

**T35. Two doctors must be on call, and at least one must be on duty. T1 checks "is Bob on
call?" — no. T2 checks "is Alice on call?" — no. T1 assigns the shift to Alice. T2 assigns
the shift to Bob. Both commit. What happened?** `TRICKY`

**Write skew**, and it is the most interesting anomaly in the set because *both*
transactions obey their isolation level's contract and the database does nothing wrong. Each
read sees a consistent snapshot, each writes a different row, so there is no dirty read, no
lost update and no uncommitted data. But the *combination* of both writes violates the
invariant that at least one doctor is on duty. Snapshot isolation prevents write-write
conflicts, and this anomaly has no write-write conflict in it. `SERIALIZABLE` prevents it
by detecting the dangerous structure — in PostgreSQL's SSI, by tracking a read of a row
followed by a concurrent write to that row by another transaction, and aborting one of them
at commit. The real lesson for an interview is that snapshot isolation is not enough for
*any* invariant that spans more than one row, and the practical answer is usually not
`SERIALIZABLE` — it is to express the invariant as a constraint the database can check
(a unique index on a `(shift_id, slot)` where only one row may claim the slot, or a
`CHECK` on a count), or to write the check and the action as one statement. "Use
`SERIALIZABLE`" is the interview answer; "make the invariant a constraint" is the
engineering answer, and saying both is what separates the two.

**T36. Under `SERIALIZABLE`, a transaction that has been running for 40 seconds aborts at
`COMMIT` with a serialization failure. Your application sees an error after 40 seconds of
work. Is that a design flaw, and what do you do about it?** `ADVANCED`

No, and it is the *specified* behaviour: `SERIALIZABLE` means transactions behave as if run
serially, and the implementation enforces that by tracking read-write dependencies and
aborting the transaction that would otherwise produce a non-serializable outcome. The
problem is not the abort; it is that the abort lands at `COMMIT`, after all the work, and
the application sees it as an unexpected exception. Three things to do, in order. First,
**retry the whole transaction** — a serialization failure is safe to retry, and the retry
loop belongs in the framework, not in each caller; the retry rate is your signal that the
workload has too much contention for the level chosen. Second, **make the transactions
shorter**, because the abort cost is proportional to the work done before it, and long
transactions hold snapshots that force conflicts. Third, and the real design fix,
**narrow the scope of the serializable section**: take the invariant check and the write
inside a short `SERIALIZABLE` transaction, and do the expensive read-only work outside it,
because read-only work outside the serializable section neither conflicts nor needs
retrying. The staff-level point is that serialization failures are a *load* metric, not a
bug: if the retry rate is above a fraction of a percent at peak, the answer is a different
isolation level for that operation or a different data model, not more retries.

**T37. T1 updates row A then row B. T2 updates row B then row A. Both start at the same
time. What happens, and who detects it?** `TRICKY`

**Deadlock**, and it is detected, not avoided. T1 holds a lock on A and waits for B; T2
holds a lock on B and waits for A. Each is waiting for a resource the other holds, so
neither can proceed and neither can release until it proceeds. The resolution is that the
engine's deadlock detector — a lock-wait graph with cycle detection, run either on a
timer or on each lock wait — finds the cycle and **aborts one transaction**, rolling it
back and typically returning `40P01` in PostgreSQL or error 1213 in MySQL. The victim is
usually the transaction with the least work, chosen to minimise the total rollback cost.
The application must therefore treat a deadlock as a **retryable** error, exactly like a
serialization failure, and a retry loop that handles one but not the other will surface the
other as a user-visible 500. The preventive measures are the ones that reduce lock-holding
time and lock count: consistent lock ordering across all code paths, short transactions, and
batching rather than row-at-a-time updates. The one thing to never do is retry inside a
transaction that has already been rolled back without re-beginning it, because the
transaction object is invalid.

**T38. A consumer reads a message from a queue, does its work in a database transaction,
and commits. Then the process is killed before it deletes the message. What happens on
redelivery, and what is the general rule?** `ADVANCED`

The message is redelivered, and the work is done **twice** — because the database commit
and the message deletion are two separate systems with no shared transaction. This is the
at-least-once delivery problem, and it is not a bug in either system; it is the
consequence of not having a distributed transaction. The three ways to handle it, and the
right one depends on the cost of duplication:

1. **Make the operation idempotent** and accept duplicates. A unique constraint on the
   natural key (`UNIQUE (order_id)` on an order-processing table) turns the second attempt
   into a no-op or a constraint violation you can treat as success. This is the correct
   default and the reason every serious consumer has an idempotency key. It is also why
   idempotency keys are in the HTTP API design of every payment provider.
2. **Inbox pattern / outbox**: record the received message id in the same transaction as
   the work, with a unique constraint, and skip messages already present. This is
   transactionally safe with no extra infrastructure, and Microservices Volume 2 Chapter 7
   owns the outbox for the publishing direction.
3. **Two-phase commit** between the database and the broker. Almost never worth it: it
   couples availability of both, it holds locks across a network hop, and it fails in
   states that are harder to reason about than duplicates.

The general rule: **design for at-least-once delivery and exactly-once effect**, because
exactly-once delivery is not available and exactly-once *effect* is achievable with an
idempotency key. And the poison-message case is the other half: a message that always
fails needs a dead-letter queue after N attempts, or it blocks the partition forever, and
the retry must be bounded and observable.

**T39. What is a dirty read, and which isolation levels permit one? Give the example.** `TRICKY`

A dirty read is reading a value written by a transaction that has not yet committed and may
still roll back. The canonical example: T1 updates `accounts.balance` from 100 to 50 and
does not commit; T2 reads 50 and, on that basis, authorises a withdrawal; T1 rolls back;
the balance is 100 and the money is gone. `READ UNCOMMITTED` permits dirty reads and is
almost never the right choice; `READ COMMITTED`, `REPEATABLE READ` and `SERIALIZABLE` all
forbid them. The interesting part is that dirty reads are not the anomaly that actually
bites in production — non-repeatable reads, read skew, and write skew are far more common,
because every engine above `READ UNCOMMITTED` already prevents dirty reads, and a team
running `READ COMMITTED` is protected from the one problem they were least worried about
while still exposed to the ones that matter. If you are asked to pick a level for a normal
OLTP application, the answer is `READ COMMITTED` for everything except the specific reads
that need stability, and the interesting engineering is identifying which those are.

**T40. `SELECT ... FOR UPDATE` on a range of rows under `READ COMMITTED`. What is locked,
and what does a concurrent insert into that range do?** `ADVANCED`

Only the rows that were actually returned and matched are locked — under `READ COMMITTED`,
`FOR UPDATE` locks rows as it reads them, and rows that fail the predicate, or that come
back already deleted, are not locked. A concurrent `INSERT` into the range is **not**
blocked, because there is no gap lock in this mode: the phantom row can appear, and it will
not be seen by the current transaction. That is the phantom problem, and it is why
"count the matching rows, then insert" is unsafe under `READ COMMITTED`. What changes by
engine: under PostgreSQL's `REPEATABLE READ` (which is snapshot isolation, not true `RR`),
`FOR UPDATE` will follow a version chain if the row was updated by a concurrent transaction
and abort with a serialization error if the row was *deleted* — a different behaviour again.
Under **MySQL InnoDB's `REPEATABLE READ`**, next-key locking extends the lock to the *gaps*
between the matched rows, which does block inserts into the range and largely eliminates
phantoms within the transaction — and that difference between PostgreSQL and MySQL under the
same isolation level name is the single most important engine comparison in this set
(Volumes 5, 7 and 8 own it). The practical guidance: never rely on `FOR UPDATE` alone to
enforce a range invariant; use a unique constraint, which is checked atomically and does not
care which isolation level you are at.

**T41. A long-running report holds a transaction open for 30 minutes on the primary. List
every mechanism by which it hurts the system.** `ADVANCED`

At least six, and they hit different layers. (1) **Row locks** on everything it touched,
blocking writers for 30 minutes. (2) **MVCC snapshot retention** — the transaction's
snapshot pins the oldest visible version, so dead row versions cannot be reclaimed and
PostgreSQL's vacuum cannot clean them; the table bloats for the duration and bloat persists
after it. (3) **WAL / undo growth** — the replication slot or the transaction's open state
keeps WAL that the primary cannot discard. (4) **Replica lag** — a long-running transaction
on the primary holds a snapshot that prevents replicas from advancing past it, so they stall
regardless of their own capacity. (5) **Connection pool exhaustion** — one connection held
for 30 minutes is one fewer connection for 30 minutes, and pool size is usually tuned for
request concurrency rather than duration. (6) **Lock table / deadlock-detector overhead** in
engines that track the wait graph. The fix is the same in every case: never run a report
inside a transaction, give the report a read replica, and if it genuinely needs a consistent
snapshot, use a held snapshot or a cursor on the replica rather than a transaction on the
primary. The phrase worth using in the interview is that a long transaction is a
**capacity** problem for the whole cluster, not a performance problem for one query.

**T42. What is a deadlock's *victim* selection, and can a deadlock livelock your
application?** `TRICKY`

The engine aborts one participant — the victim — to break the cycle, and PostgreSQL's
policy is to choose the transaction with the lowest cost to roll back, which is normally
the youngest one. The application then sees an error and, if it retries, may create a new
deadlock. Under a sufficiently high collision rate this can livelock: transactions keep
being chosen as victims, the application keeps retrying, and throughput goes to zero while
every individual transaction is "working". The fixes are the ones that reduce the
probability rather than the ones that retry harder: enforce a **global lock ordering** so
that all transactions acquire locks in the same sequence (this is the only fix that
eliminates the cycle by construction), shorten transactions to reduce the window, take
fewer locks per transaction, and use retry with exponential backoff and a cap rather than
an immediate retry. The metric to alert on is the deadlock *rate*, and the correct question
when it rises is which two code paths acquired the same two rows in different orders —
because that is always a pair of specific methods, and it is always fixable by ordering
their lock acquisitions consistently.

### Schema Design & Scaling

**D15. Design the schema for a multi-tenant SaaS. What are the options, and what decides
it?** `STAFF`

Four options, in increasing isolation, and the deciding question is what happens when one
tenant misbehaves. **Shared schema with a `tenant_id` column** is the default for most
products: cheap and simple, and its cost is that one missing `WHERE` clause is a
cross-tenant leak, so the mitigation has to be structural rather than procedural.
**Schema per tenant** in one database gives better isolation and a trivial per-tenant
export, and hits a cliff at the thousandth schema. **Database per tenant** gives true
isolation, true per-tenant restore and real noisy-neighbour solving, at the cost of
connection count multiplied by tenants, migration fan-out, and cross-tenant queries
becoming impossible. **Hybrid**: shared by default, promoted to a dedicated database for
large or regulated tenants. What decides it, in order: the data-isolation requirement if
one is regulatory; the tenant count and the size distribution, because the model has to
handle the *largest* tenant rather than the median; whether noisy-neighbour isolation is
needed or merely nice; and whether per-tenant export and erasure is required — erasure is
what forces `tenant_id` onto every table including backups. The trap in all of them is the
per-tenant *operation*, not the read: every design handles reads, and what decides the
model is "what does a delete-tenant request actually do".

**T43. You need a 1:1 relationship between `users` and `user_settings`. Separate table, or
a `settings_id` on `users`?** `TRICKY`

A separate `user_settings` table with a `user_id` foreign key that is *also* the primary
key, which enforces the one-to-one with the unique constraint. Three reasons, in weight
order. **Optionality**: a `settings_id` on `users` is nullable in practice, so every read
of settings becomes a branch and a null check, everywhere, forever. **Lifecycle skew**:
settings change when a preference changes, not when the user logs in, and under MVCC an
update is a new row version of the *whole* user row, so co-locating them bloats the hot
relation and defeats HOT updates. **Shape**: settings rows are small, optional, and evolve
at a different rate, so mixing them distorts both tables. The rule: give a one-to-one its
own table when the two sides have different lifecycles, sizes, or optionality, and keep it
inline only when the pair is genuinely one record that is always present. Note the limit:
this enforces "at most one settings row", not "every user has one" — the reverse direction
is not expressible as a foreign key and needs a `CHECK`-style or application-level
guarantee.

**T44. A `status` column: database `ENUM`, a lookup table, or a `CHECK` on `TEXT`?** `TRICKY`

`CHECK (status IN ('NEW','SHIPPED','CANCELLED'))` on a `TEXT` column is the right default:
it is portable, readable, enforced, and self-documenting, and adding a value is a
migration rather than an `ALTER TYPE`. A PostgreSQL `ENUM` stores smaller and enforces the
set, but the allowed values live in a type definition rather than the table's DDL, and
removing or reordering a value that is in use is genuinely painful. A MySQL `ENUM` is a
different animal — stored internally as an integer, cheap to extend, but MySQL-specific,
and it accepts the empty string unless strict mode is on, which produces a real and
confusing production failure. The **lookup table** earns its place the moment anything
needs to *join* on the value or carry a label, a sort order, or a colour: it becomes
enforceable with a foreign key, renamable without a data migration, and inspectable. So:
closed set with no attributes means `CHECK`; anything that needs display metadata, joining
or reordering means a lookup table.

**T45. Soft-delete `deleted_at` versus a hard delete. What breaks either way?** `TRICKY`

Soft delete preserves history and makes a mistaken delete recoverable, and it costs four
things. (1) Every query needs `WHERE deleted_at IS NULL`, and one that forgets shows a
deleted row to a customer — a correctness bug, not a style bug. (2) `UNIQUE (email)` will
reject a second soft-deleted row for the same email, so the delete becomes a permanent
block unless you use a **partial unique index** (`WHERE deleted_at IS NULL`). (3) Indexes
carry the dead rows forever. (4) The table becomes a proportion of tombstones, which is
Cassandra's disease — the remedy is the same, a retention process or time partitioning so
old partitions can be dropped whole. A hard delete costs you history, referential
integrity with child rows, and the answer to "who deleted this". The middle answer, and the
one to advocate: hard-delete from the hot table and keep an append-only **audit log** of
what was removed and when. You get the history for the questions that need it without
paying a query cost on every read.

**T46. One wide table with a `type` column and sparse columns, versus one table per type?**
`ADVANCED`

The single-table shape is what polymorphic associations need, and it wins when subtypes
share most columns and are always queried together: one index, one transaction, no joins,
and the type is data so adding a subtype is an `INSERT`. Its costs: the table is as wide
as its widest subtype, so three rare large columns make every row pay for them; a `CHECK`
per type is the only enforcement, and unless the checks are mutually exclusive and
exhaustive a type-`A` row can still hold type-`B` values; and every index spans the whole
table, so a query that only reads type `A` pays for a wider row. Table-per-type wins when
the subtypes have genuinely different shapes, access patterns or lifetimes, and costs you a
`UNION ALL` query or a join through the parent, with no foreign key possible from one
`subtype_id` to a union of tables. The intermediate answer most mature schemas reach is a
parent with a discriminator **plus** a table per type, so the common query is a single-table
join and the divergent data lives elsewhere. JSON is the third option and is really the
question "will we ever query this" — if never, it belongs in JSON; the moment we do, we
lose type checking, validation and per-field statistics.

**T47. Many-to-many between `students` and `courses`, carrying the enrolment date and the
grade. What is the table?** `TRICKY`

A join table — `enrolments(student_id, course_id, enrolled_at, grade)` — with a composite
primary key `(student_id, course_id)`. The composite key does two jobs and both matter: it
enforces "a student cannot enrol in a course twice", and it *is* the index that makes
"all courses for a student" a seek rather than a scan. The foreign keys to both parents
are non-negotiable, and because the parents' primary keys are already indexed, the
"who is in this course" direction is covered for free. The date and the grade belong on
the join table, not on either parent: they describe the *relationship*, and putting them
on a parent means a column per course, which is the classic modelling error. Whether
`grade` is nullable is a real design question — a `NULL` means "enrolled, not yet graded",
which is a genuine state, and `CHECK (grade BETWEEN 0 AND 100 OR grade IS NULL)` documents
it. A surrogate `id` on the join table is optional and only earns its place if something
else must reference an enrolment, such as a submission.

**T48. `created_at` — `timestamptz` or `timestamp`? Does it matter in practice?** `TRICKY`

`timestamptz`, always, and it matters daily. PostgreSQL's plain `timestamp` is a wall-clock
reading with **no zone**: a row written at 09:00 in London and a row written at 09:00 in
Mumbai both store `09:00` and are two hours apart in reality. Then a report grouped by hour
produces two overlapping "09:00" buckets whose totals never reconcile, and the bug is
invisible until a second region is live. `timestamptz` stores a UTC instant and renders it
in the session's zone on read, so the stored value is correct everywhere. It also breaks
`ORDER BY` across origins and makes `timestamptz - timestamp` an error, so the mixed case
does not even compute. The only case where plain `timestamp` is right is a genuinely
local wall-clock time with no instant meaning — a store's opening hours, a recurring
Tuesday appointment — and even there you usually need to store the offset, because the zone
rules change.

**T49. `id BIGINT GENERATED ALWAYS AS IDENTITY` plus a natural key
`external_ref VARCHAR(32) UNIQUE`. What have you bought and what have you cost
yourself?** `TRICKY`

Bought: a small, fixed-width, monotonically increasing primary key that is optimal as a
clustered key — inserts land at the right edge, giving sequential I/O and near-full pages,
which is why the surrogate is frequently faster than the natural key even though it is a
second source of truth. Cost: two indexes to maintain per write, a second source of truth
that can drift, and a question the schema forces every future developer to answer. Four
traps: sequential ids are **guessable**, so any route exposing `/orders/10042` enumerates
your volume and the fix is authorisation, not obscurity; ids are **not monotonic in
commit order**, because the sequence increments at allocation, so anything using ids for
change-data-capture ordering or "latest row" logic is wrong; `GENERATED BY DEFAULT` lets a
client-supplied id in, which enables a whole category of "which row did I just overwrite"
incidents, so `ALWAYS` is the setting you want; and if the source system's ids are only
unique per source, the constraint must be `UNIQUE (source, external_ref)`.

**T50. `products(id, price, cost)` and a requirement to keep every historical price. How,
and where is the trap?** `ADVANCED`

Append-only `price_history(product_id, price, valid_from, valid_to)` with half-open ranges
(`valid_from` inclusive, `valid_to` exclusive or `NULL` for current), and the current price
also on `products`. The first trap is concurrency: closing the old row and opening the new
one is two statements, so two concurrent price changes can both read the same current row
and produce overlapping or gapped ranges. The correct shape locks the current row and does
both in one transaction, and the schema should make the invariant checkable — no two rows
for a product with overlapping ranges — so the bug is caught by the database rather than by
a quarterly audit. The second trap is the query: "the price on date X" is
`valid_from <= X AND (valid_to IS NULL OR valid_to > X)`, and if anyone ever wrote `valid_to`
as inclusive the boundary day is counted twice. The third is that the current value is now
stored twice, so every read path must pick one — and *which table is authoritative for the
current price* is the design decision, not the mechanics.

**D16. A table is growing 20 GB a week. It is 2 TB and slowing down. What do you do, in
order, and when is the answer not partitioning?** `STAFF`

In order, because the order is the argument. (1) Establish that size is the cause —
a 2 TB table doing point lookups is fine, and bloat, a missing index, a plan change or a
shifted data distribution all masquerade as "it got big". Check bloat and plan history
first, because both are cheap. (2) Isolate the hot data — a partial index, a covering
index, or a cache in front of the hot rows often removes the pressure outright. (3)
**Archive**, which fixes backup time, vacuum time, index size and plan quality in one move
and is fully reversible. (4) **Partition** by the obvious time or key dimension. And then
the honest part — when *not* to: partitioning adds a per-partition index, can make some
queries slower because every partition is still planned, makes unique constraints require
the partition key, does nothing for a single hot partition, and, most importantly, **once
partitioned, every future query must include the partition key or it scans every
partition**. The number that decides it: partitioning pays when a large fraction of queries
can prune to a few partitions. If nobody ever filters by time, time-partitioning is
decoration, and the answer is archiving plus indexing.

**D17. How do you decide what goes in the relational database versus a document store, a
key-value store, or object storage?** `STAFF`

The deciding question is not "which is fastest" but **"what are the four operations, and
can I afford to be eventually consistent on the reads?"** The practical filter: if the data
is joined, filtered on many dimensions, and constrained by a foreign key, it is relational;
if it is retrieved by a known key and written whole, it is a key-value or document store;
if it is written once, read rarely, is large, and is fetched whole, it is object storage;
if it is derived and rebuildable, it is a cache or a search index and does not need to be in
the source of truth at all. I would ask, in order: what is the access path — by key, by
query, or by scan? can the read be eventually consistent, and by how much? is the data a
source of truth or a projection, and if a projection, what rebuilds it? and what are the
write rate and object size, because that decides whether you need document flexibility or
can afford a rigid row. The discipline to state aloud: **every non-relational store that is
not a cache is now a second source of truth with its own backup, restore and consistency
story**, and that is the real cost of the decision.

**D18. A `COUNT(*)` over 400 million rows is needed on a dashboard every 30 seconds. Rank
your options by cost and staleness.** `STAFF`

Ranked by the trade-off, and I would write the staleness bound next to each because the
question is really "how stale is acceptable". (1) An **exact concurrent counter** updated
in the same transaction as the insert — zero staleness, but it only counts rows and it
makes one row a **hot row** that every concurrent write contends on, serialising the write
path. (2) A **maintained aggregate table** updated by trigger or application, batched to
reduce contention — second-level staleness, one hot row per bucket, and a real design cost
in the trigger. (3) A **materialized view** refreshed on a schedule — staleness equal to the
refresh interval, and the cheap answer, because the expensive aggregation happens once per
refresh instead of once per dashboard load. (4) The **engine's own estimate**
(`pg_class.reltuples`, InnoDB cardinality) — zero cost, approximate, and as stale as the
last autovacuum, so defensible only when labelled. (5) A **cached count with a TTL** — all
of Redis Volume 9's problems, so it needs a rebuild path. What I would not do is the exact
`COUNT(*)` per dashboard load: a full scan sixty times an hour, accepted because it is
correct rather than fast. The framing: a count is the easiest query to make cheap and the
one people are most likely to leave exact.

**D19. You must add two columns to a 40-million-row table. What is the plan, and what is the
danger?** `STAFF`

The plan is expand-and-contract. `ADD COLUMN ... NULL` first — in modern PostgreSQL that is
a metadata-only operation with no rewrite. `ADD COLUMN ... NOT NULL DEFAULT x` is the one
that historically triggered a full rewrite, and the rewrite behaviour of a non-null default
has changed across versions, so check the version rather than assuming. For a non-null
column: add nullable, backfill in batches with a keyset cursor and a commit between
batches, add the constraint `NOT VALID` then validate it separately, then promote to
`NOT NULL`. The **danger** is the lock — an `ACCESS EXCLUSIVE` lock blocks every concurrent
read and write for the duration, so set a short `lock_timeout` and retry, or use an online
tooling approach. Second danger: a single-transaction backfill on 40 million rows holds
locks, generates enormous WAL, creates 40 million dead row versions, blocks vacuum and
lags replicas badly. Third, the one people forget: the **deploy is three steps**, not one —
add the column, deploy code that writes both shapes and tolerates the new column being
`NULL`, backfill, then drop the old. The fourth is that `DEFAULT` never applies to
`UPDATE`, so backfilled rows and newly written rows can disagree if the backfill computed a
value rather than copying the default.

**D20. A multi-tenant table with 2,000 tenants, where every query must include `tenant_id`.
How do you make it hard to forget?** `STAFF`

Make it impossible rather than discouraged, in this order. **Row-Level Security** is the
real answer: a policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)` means the
database filters rows regardless of what the application wrote, so a forgotten predicate
returns zero rows instead of another tenant's data. The application sets
`SET LOCAL app.tenant_id = $1` at the start of every transaction, and the connection pool
must set it **every time**, because pooled connections are reused and a leaked setting is a
cross-tenant leak. **Put `tenant_id` in every primary key and every foreign key**, so a
join cannot join across tenants by construction — that turns a whole class of forgetting
into a foreign-key violation. **Put `tenant_id` first in every composite index**, since it
is the leading equality predicate. Add a **static check or linter** rejecting a tenant-table
query with no `tenant_id` predicate. And an **integration test** that queries as tenant A
and asserts tenant B's rows are invisible — an RLS policy with no test is an untested
security control. The staff point: application-layer discipline is not a control here,
because the failure is silent and the population writing queries is unbounded.

**D21. Per-product attributes (dimensions, materials, colour, variants) that differ by
product type and must be filtered. Columns, JSON, or EAV?** `STAFF`

Relational columns when the set is known and stable per type; JSON when it is open but
document-like; EAV only when it is open and you must filter across products on any
attribute. The default answer here is **JSON plus a GIN index** in PostgreSQL. The
reasoning is that the alternatives fail in specific, nameable ways. Strict columns mean a
migration for every attribute a merchant types in, and a wide sparse table. **EAV** — the
long-thin model — is the classic answer and the classic mistake: every filter is a self-join
over a vertical table, multi-attribute matching (`GROUP BY ... HAVING COUNT(DISTINCT attr)`)
is genuinely hard to index, and the row count grows as attributes times products, so a
product with 30 attributes is 30 rows and every read is a reassembly. JSON's honest costs
are no type checking, no per-field statistics until you index, and a whole-document rewrite
on every update. The hybrid to advocate: JSON for the long tail, typed columns for the
three or four attributes that decide the search, and a denormalised filter table only if
the multi-attribute queries get complicated.

### PostgreSQL

**D22. A `COPY` of 50 million rows is taking 40 minutes on a table with eight indexes and a
trigger. What is your plan, and what do you measure?** `STAFF`

Measure first, and the three numbers that matter are elapsed time and CPU profile, WAL
volume, and index-to-heap bytes after the fact. The plan, in order, and the reversibility
argument matters as always. (1) **Drop the trigger** if it is per-row business logic — that
is almost certainly the largest cost and it is reversible. (2) **Drop the secondary indexes,
load, then `CREATE INDEX CONCURRENTLY`** — this is the standard answer and it is routinely
5 to 10× faster, because building an index once over sorted data is a sequential write
while maintaining it during a random-order load is a random write per row. (3) **One
`COPY` in one transaction** rather than batches, if incremental visibility is not needed.
(4) **Sort the input file by the indexed columns**. (5) **Raise `maintenance_work_mem`** so
index builds do not spill. (6) If it must be non-disruptive, **load into a new table and
swap**, which is instant. Nothing here is hard to undo, which is the point — this is the
rare operational problem where the answer is entirely in the cheap-and-reversible column.
What I would not do is relax `synchronous_commit` to make it faster: that trades durability
for throughput on a job that could instead be made correctly, and if the load is not
reproducible you have traded a re-runnable job for a data-loss risk.

**T53. `VACUUM` versus `VACUUM ANALYZE` versus `VACUUM FULL`. What does each do and what
blocks?** `TRICKY`

All three remove dead row versions, which under MVCC is not optional — a dead version must
survive until every transaction that could have seen it has finished, or the wrong value
becomes visible. `VACUUM` marks the space reusable and updates the visibility and free-space
maps; it does **not** return space to the filesystem and takes only a weak lock, so it does
not block reads or writes. `VACUUM ANALYZE` additionally refreshes planner statistics; the
two are independent jobs, and `ANALYZE` is needed far more often than `VACUUM FULL`.
`VACUUM FULL` *does* return space, by writing a fresh copy and swapping it in — and it
holds an `ACCESS EXCLUSIVE` lock for the whole operation, so every concurrent read and
write on that table blocks. On a 2 TB table that is a multi-hour outage. The right tool for
reclaiming space in modern PostgreSQL is `pg_repack` (online, brief lock windows) or
partitioning plus detaching a whole partition, which is instant — and that is the real
argument for time-partitioned tables.

**T54. `DELETE FROM orders WHERE created_at < '2024-01-01'` on 200 million rows. Why is it
bad, and what are the alternatives?** `ADVANCED`

Because `DELETE` does not return space. It marks 200 million row versions dead, and they
stay physically present until vacuum runs, the free-space map records them as reusable, and
subsequent inserts fill them — the only way the space comes back. The table does not shrink,
every index still holds entries for dead rows, and the write amplification is a full
rewrite's worth of heap plus index churn. Autovacuum then has to keep up, and if it cannot
you get bloat, a visibility map that is never all-visible (so index-only scans stop working
— see T28), and WAL volume for the entire delete. The alternatives: **partition by date and
`DROP` the partition**, a catalogue operation that is instant and returns the space
immediately; `TRUNCATE` if emptying the table, also instant and non-bloating; and
`pg_repack` for a live table. Never `VACUUM FULL` to clean up after a large `DELETE` — you
have just serialised the database behind a table lock. Partitioning changes the answer to
this question, which is the real argument for it: it does not so much make queries faster
as make bulk deletion a metadata operation.

**T55. What is a HOT update, and what disables it?** `ADVANCED`

A **Heap-Only Tuple** update: when an `UPDATE` changes a column that is not indexed, the
new row version is written into the same heap page as the old one and the index entries are
left untouched, with the new `xmax` recorded on the old version. It is dramatically cheaper
— no index maintenance, no random I/O across index pages, and the page stays HOT-eligible.
It is disabled when the updated column **is** indexed, because a new index entry is not a
heap pointer, and when the new version does not fit in the same page. The consequences:
a table with an index on `updated_at` — which nearly every audit column has — loses HOT
updates for any update touching it, so every such update is a full page write plus an index
insert and the table bloats much faster. And `pg_stat_user_tables`' ratio of `n_tup_hot_upd`
to `n_tup_upd` is the metric that tells you which case you are in; a low HOT ratio on a
high-update table is a direct instruction to look at the indexed columns.

**T56. `EXPLAIN` says `rows=12` on an index scan; the actual is 340,000 rows. Why is the
optimiser right to choose that plan, and why does it still take nine seconds?** `ADVANCED`

Both halves are the same phenomenon. The optimiser believed 12 rows, so the index scan
looked far cheaper than a sequential scan — and it was right *given its information*, since
a scan would have returned the same 340,000 rows. The nine seconds are the physical
consequence: 340,000 index entries read and then 340,000 **random heap fetches** for
visibility, because the plan is not index-only (a selected column is not in the index, or
the visibility map says the pages might not be all-visible). So the error is a *statistics*
problem — stale statistics, a low sample, or two columns the planner assumes are
independent when they are correlated — and the fixes are `ANALYZE`, a higher
`ALTER TABLE ... ALTER COLUMN ... SET STATISTICS`, extended statistics for the correlated
pair, or a partial index. The lesson: **a bad plan is usually a wrong estimate, not a
missing index**, and the estimate-versus-actual gap tells you which. Adding an index on top
of a mis-estimate leaves you with write overhead and no read benefit.

**T57. One `SELECT` is slow, the same query elsewhere is fast, and the table shows an
enormous number of dead tuples. What is happening?** `TRICKY`

A long-running transaction is pinning dead row versions, so vacuum cannot clean the table at
all. A single `pg_dump` started this morning, an interactive `psql` left open at a `SELECT`
prompt, or a repeatable-read reporting job stops vacuum from reclaiming anything, and the
symptom is that everything on the table gets slower while the slow query looks innocent.
Vacuum cannot remove a dead tuple whose `xmin` might still be visible to an open
transaction, so the table's index grows, index scans degrade, and the free space map stops
being maintained. The diagnostic is `pg_stat_activity` ordered by `xact_start`, and then
finding the *oldest* — which is usually an `idle in transaction` application connection that
never committed or rolled back. The fixes: set `idle_in_transaction_session_timeout` so the
database closes it, fix the code path, then `VACUUM`. The deeper lesson: the worst offender
is rarely a slow query, it is a connection holding a snapshot while doing nothing.

**T58. What is `pg_stat_statements`, and which numbers in it decide where to look?**
`TRICKY`

An extension that records normalised, de-duplicated statements with execution statistics,
and the single most useful extension in a PostgreSQL installation because default logging is
not query-oriented. The numbers: **`calls`** (frequency, which determines how much a fix is
worth — a 10 ms query called 400,000 times a minute is the whole problem, and a 10-second
query called twice a day is not), **`total_exec_time`** (where the aggregate cost is),
**`mean_exec_time`** (which normalises for frequency and finds the per-call offenders), and
**`rows`** (the tell for a missing index or a fan-out — millions of rows returned where the
caller wanted ten is a missing `LIMIT` or a `SELECT *` in a loop). Also read
`shared_blks_hit` versus `shared_blks_read` to separate a CPU-bound plan from an I/O-bound
one, and `temp_blks_written`, which spikes when a hash join or sort spills to disk and so
points at `work_mem` rather than an index. The habit: rank by `mean_exec_time` to find the
per-call cost, then by `total_exec_time` for the aggregate, and do not optimise a query that
is neither.

**T59. `COPY` into a table with no secondary indexes, versus the same rows inserted in
batches. What is the fastest path, and when does `COPY` lose?** `TRICKY`

`COPY` inside one transaction, into a table with no secondary indexes and no triggers, is
the fastest path by a wide margin: it streams rows in a batched protocol with no per-row
statement overhead, and it avoids the per-row parse/plan/execute cycle that a multi-row
`INSERT` pays only once. It becomes *slower* when the table carries many indexes, because
each is maintained per row and a B+ tree maintenance is a page read, a modification, a
possible split and a WAL entry — and it becomes far slower when the arriving data is
unsorted, so index pages are read and split randomly. So the recipe for a large load is
`COPY` in one transaction into a bare table, then `CREATE INDEX CONCURRENTLY` for each
index, then `ANALYZE`. Secondary indexes are the single biggest factor: building an index
once over sorted data is a sequential write, while maintaining it during a random-order load
is a random write per row. If the load must be incremental, sort the input by the index
columns first and batch the commits so vacuum can reclaim as you go.

**T60. Adding a foreign key to an existing 400-million-row table. How, and what is the
trap?** `ADVANCED`

Add it `NOT VALID`, then validate it separately. `ALTER TABLE ... ADD CONSTRAINT ...
FOREIGN KEY ... REFERENCES ...` validates every existing row and takes a strong lock on
both tables for the duration, which on 400 million rows is an outage. The two-step form
takes a brief lock to record the constraint, skips validation, and then runs
`VALIDATE CONSTRAINT` as a separate statement that takes only a weaker lock and scans in
batches — so the constraint is enforced for new writes immediately while historical rows are
checked in the background. The trap is that a `VALIDATE` that *fails* leaves the constraint
in place but not validated, so subsequent inserts are checked and the historical data is
not, and that state is easy to miss: `convalidated` in `pg_constraint` is the field to check,
and a migration framework that does not check it will report success. The second trap is
lock ordering — validating acquires a lock on the child table, so schedule it, and use a
short `lock_timeout` with a retry rather than queueing behind it. The third is that a
foreign key is only cheap if the parent's key is indexed, which it is for a primary key, and
only safe if the parent key is **immutable**, because an update to a parent key cascades
across every child row inside one transaction.

**T61. `EXPLAIN` without `ANALYZE` versus with it. What can only one of them tell you?**
`TRICKY`

`EXPLAIN` alone shows the *plan* the optimiser chose using estimates only; it never executes
the statement, so it is safe on a production query but its row counts are guesses. `EXPLAIN
ANALYZE` executes the statement and reports actual rows and actual time per node, which is
the only way to see an estimation error — and it means you have actually run the query, so
on a `DELETE` or a heavy `UPDATE` you must wrap it in a transaction and roll back. The
three things only `ANALYZE` can tell you: whether the estimates were right (the
estimate-versus-actual gap at each node, which localises the cause to a specific relation),
whether the plan's assumed algorithm is affordable in reality (a hash join estimated at 50
rows that returns 4 million behaves nothing like the plan), and the real per-node timing,
which shows where the time actually goes rather than where the model thought it would. The
practical protocol, and the one worth stating in an interview: `EXPLAIN` first, because it
is free and safe; read the estimates for obvious absurdity; then `EXPLAIN (ANALYZE,
BUFFERS)` inside a transaction you roll back, and compare node by node. `BUFFERS` matters
because it separates shared-buffer hits from reads — a plan that is fast in buffers and slow
in reads is an I/O problem, and one that is slow in both is a CPU or a plan problem.

**T62. Why does a connection pooler in transaction mode interact badly with prepared
statements and session state?** `ADVANCED`

Because the pooler hands a *server* connection to different clients, so anything stored in
the session — a prepared statement, a `SET`, a temporary table, a `LISTEN`, an advisory
lock, a cursor — belongs to the server connection rather than to the client, and a client
that assumes otherwise is wrong in ways that surface as intermittent, unreproducible
failures. The specific case: PgBouncer in **transaction mode** multiplexes many clients
onto few server connections, and a protocol-level prepared statement issued by client A can
be left on a server connection that is then handed to client B, where it either does not
exist (an error) or exists as someone else's object (a correctness or security problem).
The mitigations are all "declare the dependency": use **session-level** or unnamed
statements, `SET LOCAL` for anything scoped to a transaction rather than `SET`, disable
prepared statements in the driver, or run the pooler in **session mode** — which gives up
most of the pooling benefit. `LISTEN`/`NOTIFY` and advisory locks need session affinity
outright. The honest summary: a pooler in transaction mode is a correctness constraint on
your application, not a transparent optimisation, and the constraint is invisible until two
clients collide.

**T63. Transaction ID wraparound, and what actually happens when it approaches.** `ADVANCED`

Every transaction gets a 32-bit `xid`, and that space is finite, so PostgreSQL must recycle
it. It cannot simply wrap, because old snapshots would then see a future `xid` as "not yet
visible" and become corrupt, so the `xid` space is split: a normal range and a "frozen"
range, and once the normal range is nearly exhausted the engine must advance the
`xmin` horizon — by assigning the current `xid` to every still-visible row, so those rows
are now older than the frozen threshold and can never conflict again. That is a full-table
rewrite of every live row, and on a large database it takes a long time and needs disk. The
protection is `autovacuum_freeze_max_age`, and the tuning is to keep the transaction
horizon advancing well before the limit — the metric is `age(datfrozenxid)` on the oldest
table, and the alert threshold is normally well below `2^31`. What causes it to run away is
a **long-running transaction or an abandoned replication slot** holding `xmin` back, so
that no amount of vacuum can advance the horizon; the symptom is autovacuum failing to
freeze with "preventing wraparound" messages and a `datfrozenxid` age that stops improving.
The fix is to find and end the blocker, not to raise the limit. The interview-relevant
point: this is the one place where a resource leak becomes unrecoverable without
intervention, which is why wraparound age is a page at 3am and replication slot lag is not
an afterthought.

**T64. Physical replication versus logical replication. When do you need each?** `TRICKY`

**Physical** (a WAL stream of block-level changes, `streaming replication` or logical
streaming of a *specific database*) ships whole-page changes, so a standby is
byte-identical, is a genuine failover target, and supports zero-downtime failover — and it
replicates everything, including `CREATE INDEX`, `VACUUM`, and the DDL that will be a
problem when the roles swap. **Logical** (`PUBLICATION`/`SUBSCRIPTION`) ships logical
decoding — row-level change events — filtered by table and column, optionally with a
`WHERE` clause, which is what makes **selective replication** possible: replicate four
tables out of four hundred, or one tenant's rows, to a separate cluster. It also makes
cross-engine and cross-version movement possible (PostgreSQL to a different major version)
and turns the WAL into an event stream that can feed a search index or a cache. The costs,
stated honestly: logical replication is a per-row pipeline with a slot that retains WAL
indefinitely if the subscriber falls behind — the most common operational failure in the
set — so it is not a failover mechanism; it does not replicate DDL, which must be applied
separately on the subscriber; and it is not synchronous by default. So: physical for
failover and replicas, logical for selective data movement, version upgrades, and
change-data-capture, and never confuse the two when designing a DR plan.

### MySQL

**D23. A MySQL primary has 5 million rows in a 40 GB InnoDB table. Writes are the
bottleneck. `SHOW ENGINE INNODB STATUS` shows a history list length of 1.2 million. What is
going on, in order?** `STAFF`

The history list length is the count of **undo records not yet purged**, so 1.2 million
means purge is behind by a wide margin — and that is the root cause of the other symptoms,
so it comes first. Read it as: MVCC readers are pinning old row versions, purge cannot
reclaim them, the undo tablespace is growing, and every consistent read walks a longer
version chain. Then the causes, in likelihood order: (1) a **long-running transaction** — an
idle-in-transaction session, a forgotten report, an uncommitted `UPDATE` in a staging
console — which pins the oldest version and stops purge entirely; (2) **a lagging replica**,
which holds a snapshot on the primary for as long as it is behind, so replica lag and undo
growth are the same problem seen from two angles; (3) a workload of many short transactions
where the *rate* of version creation exceeds purge throughput. Then check the consequences:
buffer pool hit ratio, undo tablespace size, and whether optimiser row estimates are now
skewed by the bloat. Fix order: find and kill the pinning transaction
(`information_schema.INNODB_TRX`), bring replicas back, then tune. And the structural
answer if the workload is genuinely version-heavy: shorter transactions, more undo
tablespaces so purge can run in parallel, a shorter `innodb_purge_interval`, and less
update volume — because in InnoDB every update is a delete-plus-insert, exactly as in
PostgreSQL.

**T66. InnoDB's clustered index versus a secondary index. What is stored where, and what
does a query selecting a non-indexed column cost?** `TRICKY`

The **clustered index is the table**: the leaf pages of the primary-key B+ tree hold the
entire row in primary-key order, which is why the primary key is a physical design decision
and not just a constraint. A **secondary index** stores only the indexed columns plus the
row's primary key — never the rest of the row — in its own tree ordered by the secondary
key. So `SELECT * FROM orders WHERE customer_id = 5` uses the secondary index to find
primary keys and then, for each one, looks up the clustered index in a differently-ordered
tree: a **random heap-style fetch per row**. If the query needs columns not in the
secondary index, the plan is non-covering and at scale it is slow. The fix is a **covering
index** — include the extra columns at the end of the secondary index so the query is
answered entirely from it, which is why MySQL's advice is "index the filter columns, then
the selected columns, then the sort column" rather than PostgreSQL's separation into key
and `INCLUDE`. The second consequence of clustering: a **random primary key** — a UUIDv4,
a hash — makes every insert a random page split, fragments the clustered index, and degrades
write performance badly. That is the whole physical argument for auto-increment integer
keys in MySQL.

**T67. What do `Using filesort` and `Using temporary` in `EXPLAIN` mean, and can you remove
both?** `TRICKY`

Both say the optimiser could not do the operation for free. `Using filesort` does **not**
necessarily mean a disk sort — it means the rows could not be returned in the requested
order by an index, so they are gathered and sorted, and whether that spills depends on the
sort size versus `sort_buffer_size`. `Using temporary` means an intermediate result is
materialised, typically a `GROUP BY` or `DISTINCT` on non-indexed columns, or a `UNION`. You
remove both by giving the optimiser an index that produces the required order and grouping
in that order: `(filter_col, sort_col)` makes the filter a seek and the sort disappear;
`(group_col, agg_col)` makes the grouping a streaming operation over the index and the
temporary disappear. This is the leftmost-prefix rule applied to what the *plan* needs rather
than to what the query filters. Two honest caveats: a filesort on a few thousand rows is
milliseconds and is not a problem, so read the row counts rather than the annotation; and
an index that satisfies the sort can make the filter less selective, and the optimiser is
not always good at that trade, so confirm with a forced index and compare actual rows.

**T68. `innodb_flush_log_at_trx_commit` — the three settings and what you are actually
trading.** `TRICKY`

The setting controls when the redo log is flushed, and it is InnoDB's durability knob, so
the trade is crash safety against write throughput, and the difference is large. `1` (the
default) commits and flushes at every commit, so a power or OS crash loses nothing. `2`
writes to the OS file buffer at every commit and flushes about once a second, so an **OS
crash** loses up to a second of committed transactions while a **process crash** loses
nothing, because the OS still holds the data. `0` writes to the log file at every commit and
lets the OS decide when to flush, so an OS crash can lose a second or so. The staff point
that catches people: this is not a free throughput win, it is a decision about how much
committed data you are willing to lose, and the setting is **global**, so it applies to
every workload on the instance. Many teams therefore run `2` for write-heavy ingestion and
`1` for payments, which is why "what should this be" is really "is losing the last second
of commits acceptable for *this* workload", and why the instance-wide setting is a poor fit
for a mixed estate. Pair it with `sync_binlog=1`, because a relaxed pair leaves a window
where a crash leaves the redo log and the binlog disagreeing.

**T69. What is a gap lock, and what query pattern produces a deadlock storm from one?**
`ADVANCED`

A gap lock is a lock on the *space between* index entries rather than on a row, taken under
`REPEATABLE READ` when a locking read scans an index range, and its purpose is to stop
other transactions inserting into that range — which is how InnoDB eliminates phantoms for
`SELECT ... FOR UPDATE`. The pattern that produces a storm is a **non-unique index scan with
a locking read**: `SELECT ... WHERE status = 'NEW' ORDER BY id LIMIT 1 FOR UPDATE` on a
`status` index locks every matching row *and every gap between them*, so a concurrent
insert with `status = 'NEW'` anywhere in that region blocks; if two transactions acquire
overlapping gap sets in different orders you get a deadlock, the victim is rolled back, it
retries, and the collision rate turns the retry loop into a throughput collapse. The
mitigations: add an index that makes the access **unique** (or a single record) so the lock
is on one row rather than a range; lower the isolation to `READ COMMITTED`, which disables
gap locks and is the standard recommendation for MySQL OLTP; keep transactions short; and
always retry on deadlock. The diagnostic point: gap locks are invisible in the SQL and show
up in the `LATEST DETECTED DEADLOCK` section of `SHOW ENGINE INNODB STATUS` and in
`performance_schema.data_locks`, so a deadlock between two transactions touching completely
different rows is the signature that tells you gap locks are involved.

**T70. `EXPLAIN` says `type: ALL` on a 90-million-row table. What does `type` mean across
its values, and what do you do about `ALL`?** `TRICKY`

`type` is the access method, best to worst: `const` (a unique-index match found in one
probe — constant time), `eq_ref` (exactly one row per outer row via a unique key, the
signature of a correctly indexed join), `ref` (non-unique index equality, several rows per
value), `range` (index scan over an interval), `index` (full scan of the index, sometimes
better than a table scan because the index is narrower), and `ALL` (full **table** scan).
So `ALL` is not automatically wrong — on a 500-row table it is the correct and cheapest
plan. On 90 million rows it means a missing index, a predicate the index cannot serve (a
function on a column, a leading-wildcard `LIKE '%foo'`, a type mismatch forcing a cast), or
a very low-selectivity predicate where the optimiser has correctly decided a scan is
cheaper. So the answer to "what do I do about `ALL`" is not "add an index" — it is to
establish which of those three it is, and accept the third. Two related checks:
`Extra: Using where` with `ALL` means the scan is filtered, often unavoidably, and
`Using index` means the index alone satisfies the query, which is the covering case. And
`possible_keys` versus `key` is the diagnostic: if `possible_keys` is populated and `key` is
`NULL`, the optimiser rejected an available index, and the reason is nearly always cost or
cardinality.

**T71. You index a `VARCHAR(255)` in `utf8mb4`. What is the limit, what happens when you hit
it, and what are the two ways around it?** `ADVANCED`

`utf8mb4` uses up to **4 bytes per character**, so `VARCHAR(255)` needs up to 1,020 bytes of
key, and InnoDB's index key limit is **3,072 bytes** per index (with
`innodb_large_prefix` and modern row formats; the older limit was 767). So 255 characters
fits — but `VARCHAR(500)` in `utf8mb4` needs 2,000 bytes and still fits, while a
`VARCHAR(1000)` needs 4,000 and fails with "Specified key was too long". The error appears
at `CREATE INDEX` time, not at `INSERT` time, which is why it surprises people. The two
ways around it: a **prefix index**, `KEY (url(191))`, which indexes only the leading
characters and works for `LIKE 'prefix%'` and for equality only if the prefix is
discriminating — a bad prefix silently returns wrong candidates, which is a correctness
trap, not just a performance one; or hashing the column, or a generated column, for
equality lookups. The related trap that catches people more often: `utf8mb3` versus
`utf8mb4` in a *column* definition cannot be changed by an `ALTER` that claims otherwise,
and a `VARCHAR(191)` chosen to fit the old 767-byte limit is a workaround that is still
lying in the schema eight years later. Column lengths should be chosen from the data, and
the index length problem solved with a prefix or a hash, not by shrinking the column.

**T72. How does MySQL 8 change a large table's schema without downtime, and what are the
options?** `ADVANCED`

Three mechanisms, and they differ in what they are safe for. **`ALGORITHM=INPLACE`** — many
`ADD COLUMN`, index creation, and some `DROP COLUMN` operations rebuild the table but allow
concurrent DML, so writes continue, though there is a brief metadata lock at the start and
end. **`ALGORITHM=COPY`** (or an `ALGORITHM` the server cannot do in place) makes a full
copy under an exclusive lock, blocking everything, and the engine will silently fall back to
it unless you *require* the algorithm — which is why the correct migration statement says
`ALGORITHM=INPLACE, LOCK=NONE` and fails loudly rather than blocking a table for an hour.
**`ALGORITHM=INSTANT`** adds a column at the end of the row or drops one, in metadata only,
in 8.0.12 and later, with limits on column count and position. For anything not covered —
changing a column type, a primary key, or a full `CONVERT TO CHARACTER SET` — the answer is
an external tool: `pt-online-schema-change` or `gh-ost`, which build the new structure in a
shadow table and swap it in with a brief lock while copying rows in chunks and copying
concurrent writes via triggers or the binary log. The operational discipline either way:
set a `lock_wait_timeout` so the migration fails rather than queueing behind a long
transaction, run it against production-shaped data in staging, and rehearse the reverse
step, because a migration that cannot be reversed is an irreversible change by another
name.

**T73. Redo log, binary log, undo log — what does each one do, and why does a transaction
commit involve all three?** `TRICKY`

The **redo log** is InnoDB's physical crash-recovery log: it records page-level changes so
the engine can replay them after a crash, and the `innodb_flush_log_at_trx_commit` setting
controls how eagerly it is flushed. The **undo log** is the inverse: it records how to
*undo* a change, which is what MVCC readers need in order to see the version of a row that
predates their snapshot, and it is what purge eventually discards. The **binary log** is the
server-level logical log: it records row or statement changes in an ordered stream, which is
what feeds replicas, point-in-time recovery, and external consumers. A commit therefore
does: modify the buffer pool pages, write an undo record, write a redo record, and write a
binlog record — and the ordering between the redo and binlog is where **two-phase commit**
between InnoDB and the binary log comes from, because a crash between writing them would
leave a transaction in one and not the other. The two configuration combinations that get
this wrong are `innodb_flush_log_at_trx_commit=2` with `sync_binlog=0`, which allows losing
committed data on a crash, and a replica that is not actually applying the binlog, which is
a silent data-integrity failure rather than an availability one.

**T74. Deadlock error 1213 versus lock wait timeout 1205. Are they the same, and do you
retry both?** `TRICKY`

They are different and the distinction matters operationally. **1213, deadlock**, is the
detector finding a cycle in the lock-wait graph and choosing a victim; it happens fast
(milliseconds) and the victim is chosen, usually the transaction with the least work. **1205,
lock wait timeout**, is a transaction that simply waited longer than
`innodb_lock_wait_timeout` (default 50 seconds) for a lock; no cycle was involved — it is
usually one transaction waiting on another that is doing a lot of work. The retry answer is
"yes to both, but differently". A deadlock is *expected* to recur under contention and a
blind immediate retry is appropriate with small jitter, because the engine already picked
the cheapest victim. A lock-wait timeout usually means a long-running transaction is
holding locks, so retrying immediately in a loop will just time out again and turn into a
load problem — the correct response is to shorten the transactions, enforce consistent lock
ordering, and treat a rising 1205 rate as a code smell rather than as noise. The genuine
error-handling requirement: both must be handled as *retryable at the transaction level*,
meaning the whole transaction is re-begun, and any application that catches the error and
continues on the same, now-aborted, transaction object is broken.

**T75. What is `innodb_file_per_table`, why does it matter, and what is the
`innodb_page_size` trade-off?** `TRICKY`

`innodb_file_per_table` (on by default) puts each table in its own `.ibd` file rather than
all tables sharing the system tablespace. That matters for three reasons: a table can be
dropped or truncated and the disk space is actually returned to the operating system, which
is not true of the shared tablespace; a single table's autoextend growth cannot fragment
the whole instance; and per-table file-per-table sizes are what any "which table is filling
the disk" investigation reads. `innodb_page_size`, by contrast, is set at initialisation and
is effectively permanent — 16 KB is the default and the sane choice, 8 KB suits very small
row sizes, and 32 or 64 KB suits very large blobs or row sizes where a row spans pages. The
reason it is permanent is that the page size is baked into every file format and every B+ tree
in the instance, so changing it means a dump and reload, not an `ALTER`. The trade-off is
the same one as in PostgreSQL: a larger page means fewer index levels and better sequential
I/O for large rows, and more internal fragmentation and more write amplification for small
rows, because a B+ tree update on a 64 KB page rewrites 64 KB.

**T76. When would you use a JSON column instead of columns or a normalised child table, and
what are the three ways it goes wrong?** `ADVANCED`

Use JSON when the attribute set is genuinely open, the shape is document-like, and you
**never** need to filter, join, sort or aggregate on those attributes. It is the right tool
for a rarely-read, loosely-structured blob, and the wrong tool for anything the query layer
touches. The three ways it goes wrong. (1) **No statistics and no validation**: an
unindexed JSON attribute is opaque to the optimiser, and a value that should be a number
arrive as a string produces silent wrong answers rather than an error. (2) **Rewrite
amplification**: in a row-store engine, updating one key in a large JSON document rewrites
the whole row — in MySQL, JSON is stored off-page for large documents, which is a partial
mitigation but not a fix. (3) **The table becomes a schema-less design that is neither**:
once a handful of fields are always present, a typed generated column with a real index is
strictly better than reaching into JSON. The pattern that works is a **hybrid**: a small
number of typed, indexed columns for what is queried, plus JSON for the long tail, plus a
generated column or a functional index for the one or two JSON paths that are queried
often enough to matter. MySQL 8's functional indexes and PostgreSQL's expression indexes
both make that last step a one-liner.

### Redis & Caching

**D24. Three services each cache the same expensive query, with independent TTLs and
independent invalidation. What is the problem, and how would you fix it at staff level?**
`STAFF`

The problem is not a bug, it is a **missing architectural decision**: you have deployed a
distributed cache-invalidation problem without a strategy. The three TTLs differ, so the
services disagree for up to three TTLs and a user sees their own change in one part of the
product and not another; a cache-aside invalidation lost in transit leaves the entry stale
until its TTL expires, so correctness now depends on the TTL rather than on the data; and
the invalidation is a write-path dependency, so a slow Redis makes writes slow. The fix is
not a better TTL, it is naming what is authoritative. In order: **(1) declare the source of
truth the database and the caches explicitly eventually-consistent**, in a design doc, with
TTLs set from the staleness the *business* tolerates and different per data type — a country
name and a stock price should not share a TTL. **(2) move from cache-aside to explicit
invalidation** via a pub/sub or stream event on write, so propagation is fast and the TTL
becomes a backstop rather than the mechanism. **(3) collapse the shared caches into one**, so
there is a single invalidation point — a team-boundary decision that trades coupling for
consistency and is right only if the services ship together. **(4) if the staleness is
genuinely unacceptable, do not cache across services at all** — publish a materialised
projection instead. The process point: TTL and invalidation behaviour belong in the runbook
with a named owner, because this is the class of bug that appears six months after the team
that understood it has moved on.

**T78. A cache-miss storm after a deploy. 4,000 requests per second hit an endpoint whose
cache is empty and the database falls over. Why, and what are the fixes?** `ADVANCED`

**Cache stampede**: when a popular key expires or is evicted, every concurrent request for
it misses simultaneously, and with no coordination 4,000 requests go to the origin rather
than one. If the database cannot serve 4,000 copies of the same query it falls over, which
keeps the misses alive longer, which makes the fall worse — a feedback loop with a 4,000×
load multiplier. The fixes are layers, not alternatives. **(1) Probabilistic early expiry**:
compute the TTL as a base with a small random shortfall so the 4,000 requests spread their
repopulation across a window. No locking, no new infrastructure, and it turns an
instantaneous spike into a ramp. **(2) Request coalescing / single-flight**: one caller
popsulates under a per-key lock while the rest wait, with a bounded wait — most client
libraries have a singleflight or stale-while-revalidate helper. **(3) Stale-while-
revalidate**: serve the expired value while one background request refreshes it, which is
the only fix that keeps latency flat *during* recovery. And a mitigation rather than a fix: a
**circuit breaker** in front of the origin, so a struggling database sheds load
deterministically instead of queueing until it dies.

**T79. A user sees another user's data. The cache key is `user:{id}:profile`. How does that
happen and what do you change?** `TRICKY`

Almost always a key-construction bug rather than a Redis problem, in one of two shapes: the
key omits a dimension the response actually varies by, so `user:42:profile` is served
regardless of which relationship the request arrived under; or the key is built from a value
that is not unique to the user — a session id reused after a role change, or a missing
tenant id in a multi-tenant system where the same account id exists in two tenants. The fix
is a rule, not a patch: **every cache key is derived from the full set of dimensions the
response varies by**, and for anything security-relevant the safest form is a hash of the
canonical request — user, tenant, role, permissions version, locale, feature flags — which
removes the class of bug rather than the instance. Pair it with an environment prefix and a
namespace per data classification, and add a test asserting that two users with different
ids produce different keys. The staff point: caching an authorisation-scoped response
without the authorisation in the key is a data leak with a performance optimisation
attached, and the blast radius of a cache invalidation bug is identical to a data bug.

**T80. Cache penetration, stampede and avalanche — name the mechanism and the fix for
each.** `TRICKY`

Three distinct failure modes with different fixes. **Penetration**: requests for keys that
do not exist and never will — an attacker generating `user:99999999`, or a bug — miss
every time, so every request reaches the origin, and because a miss is the *expected* state
nothing looks wrong. Fix: cache the negative result with a short TTL, and bound the key
space. **Stampede**: one popular key expires or is evicted and thousands of concurrent
requests all miss together — a deep spike against *one* key. Fix: early-expiry jitter,
request coalescing, stale-while-revalidate. **Avalanche**: a large number of keys expire at
the same moment, typically because they were populated in one batch with the same TTL, so
the spike is broad rather than deep. Fix: TTL jitter, so population time determines expiry
time. The detail worth saying out loud: penetration is about keys that never existed,
stampede is concurrency on one key, avalanche is correlation across many keys — and the two
concurrency-shaped ones are both fixed by jitter, while penetration is fixed by caching
negatives.

**T81. `SET key value EX 300 NX` as a distributed lock. It works. Name the five ways it can
fail.** `ADVANCED`

(1) **Expiry without renewal** — if the holder takes longer than the TTL, a GC pause, a slow
dependency, a lock held across a user-visible wait, the key expires and a second holder
acquires it while the first is still working. Every distributed lock needs a renewal
watchdog and a renewal interval well under the TTL. (2) **Releasing someone else's lock** —
`if get(key) == myToken then del(key)` is two commands and not atomic, so the check can
pass, the TTL can expire in between, another holder can acquire, and the `del` destroys
*their* lock. The fix is a compare-and-delete in a Lua script via `EVAL`, which is atomic
inside Redis. (3) **A Redis primary failover can lose a write**, so a lock set on the old
primary can vanish; this is why Redlock's guarantees are contested and why a Redis lock is
not a substitute for a consensus-backed lease where correctness depends on it. (4) **A
pause longer than the TTL** — a stop-the-world GC or hypervisor freeze — means the holder
returns having lost the lock, and if it does not check that the lock *changed*, it
continues under a lock it no longer holds. (5) **The `SET NX` retry storm** — 200 workers
contending on one key all spinning is itself a thundering herd, fixed with bounded
randomised backoff rather than a fixed sleep. And the honest closing point: where
correctness depends on mutual exclusion *across a crash*, you want a lease with **fencing
tokens** — a monotonic number the downstream resource rejects if stale — because that
survives the case the lock cannot, which is a holder that is partitioned and still believes
it holds the lock.

**T82. Why is a Redis `MULTI`/`EXEC` not a transaction, and what is wrong with `WATCH` as
optimistic locking?** `TRICKY`

`MULTI`/`EXEC` does not roll back. It queues the commands and runs them all, with **no
isolation and no rollback** — if the third command errors, the first two are still applied
and there is no `ROLLBACK` to undo them. It is atomic against *other clients* (Redis is
single-threaded) but it is a **batching** mechanism, not a transaction, and an `EXEC`
interrupted by a restart has executed some of the commands. `WATCH` is the real
compare-and-set primitive: Redis marks the watched keys and aborts the `EXEC` if any
changed. Its limitations are where the traps are — the whole transaction must be retried
by the client, so any writer to those keys, including your own retry loop, can livelock
you; the protected critical section cannot include a slow downstream call, because the
protection is only against Redis keys and not against the database; and a `WATCH` on a key
nobody else writes protects nothing at all. The right answer for an atomic server-side
operation is a single `EVAL`/`EVALSHA`: one Lua script sees all its keys, runs atomically,
and cannot be interleaved, which is why compare-and-delete and most lock releases are done
that way.

**T83. Redis is at 95% `maxmemory`. What are the eviction policies, which do you pick, and
what happens under each when memory is full?** `ADVANCED`

`maxmemory-policy` decides what Redis does at the limit. `noeviction` is the default and
returns an **error** to writes, which is correct for anything where a silently dropped
write is worse than a failure — a queue, a session store, a lock. `allkeys-lru` and
`allkeys-lfu` evict any key; the `volatile-lru` / `volatile-lru`-style family evicts only
keys *with a TTL set*, and that family is dangerous precisely because keys without a TTL
become un-evictable, so the instance hits `maxmemory` with freeable memory nowhere to be
found — a configuration bug that presents as "Redis is full but `INFO memory` says 40%
used". The real decision is `allkeys-*` versus `volatile-*`: `allkeys-lru` is right for a
cache, `allkeys-lru` is wrong for a session store because a lost session logs a user out.
Two details: the LRU is an **approximation** (a small random sample plus a scan, an
intentional O(1) trade for slight inaccuracy), and the operational rule is to size the
instance so eviction is an exception, alerting on `evicted_keys` rather than
`used_memory` — which is *by design* near the limit under an eviction policy.

**T84. Why not use Redis as the job queue, given it already does lists and pub/sub?** `ADVANCED`

Three reasons, in order of weight. (1) **At-least-once with acknowledgement is not
built in**: a `BRPOPLPUSH` into a processing list is the standard pattern precisely because
plain `BRPOP` deletes the message before the work is done, so a worker crash loses it. That
pattern is usefully primitive, but it is a queue protocol implemented by every consumer
team slightly differently, and it needs its own visibility-timeout and reaper logic.
(2) **No fan-out**: a pub/sub message goes to whoever is connected *right now*, so a
consumer that was restarting, or not yet started, misses it permanently — there is no
replay, no offset, no consumer group. Building a consumer-group protocol on top of
`XREAD` with per-consumer offsets and pending-entry lists is reimplementing Kafka. (3) **The
durability story**: `appendonly yes` with `everysec` fsync gives at most one second of loss,
which is usually fine and is sometimes not, and the memory model is a single node, so
scaling means sharding the queue and dealing with the resulting ordering guarantees yourself.
The honest answer: Redis is a fine queue for a single, well-understood, at-least-once
workload with a modest retention, and it is the wrong choice the moment you need replay,
multiple independent consumer groups, or per-message ordering — because those are what the
queue product is for.

**T85. A single Redis node is a single point of failure for your locks and your cache. What
is the actual risk, and what do you do?** `ADVANCED`

Separate the two. For the **cache**, a Redis restart is an availability event, not a
correctness one, provided the application degrades to the database and the database can
take the load — which is the property to test, because a 4,000-request-per-second stampede
(T78) is what actually happens on restart, not the restart itself. For **locks**, the risk
is real and specific: replication is asynchronous, so a promoted replica may not have
received the `SET NX`, and a lock that existed can vanish while its holder believes it is
held; the mirror image is a failover where a lock is *lost* and a second holder proceeds
concurrently. That is why a Redis lock is a performance and mutual-exclusion mechanism, and
not a correctness guarantee across failures. The options, in order: a **sentinel or cluster
setup** removes the single-node availability problem but not the asynchronous-replication
problem; **fencing tokens** remove it properly, because the downstream resource rejects a
stale token regardless of what the lock service believes; and for the cases where
correctness truly depends on it, **use a store with a linearizable write** — ZooKeeper or
a consensus-backed lease — or restructure so no mutual exclusion is required, which is
usually the better answer. The staff framing: ask what breaks if the lock service loses
state, and if the answer is "two holders proceed", the lock is not solving what you think
it is solving.

**T86. What would you monitor on a Redis instance, and which three metrics would page
you?** `ADVANCED`

The full set is large, but the ones that matter operationally cluster into four groups.
**Memory**: `used_memory` against `maxmemory`, and critically `evicted_keys` — the one that
tells you eviction is happening, and it is invisible in `used_memory` because that is
*pinned near the limit by design* under an eviction policy. **Latency**: `instantaneous_ops_per_sec`, and
`latency-per-sec` percentiles, plus `SLOWLOG` entries with their durations and the command
involved. A p99 that has moved from 0.2 ms to 40 ms is a real incident and it usually
precedes the outage. **Keyspace**: `keyspace_hits` and `keyspace_misses` — the **hit rate**
is the single number that tells you whether the cache is earning its place, and a hit rate
that has silently fallen from 0.95 to 0.3 is a design failure that no amount of
infrastructure will fix. **Structure**: `INFO keyspace` for the number of keys per database,
`bigkeys`/`memories` samples for a key that has grown to hundreds of megabytes, and clients
and blocked clients for a `BLPOP` that is starving. Of those, the three that should page are
**hit rate**, **evicted keys**, and **latency** — because the first two are the cache
failing at its job and the third is the cache failing at its other job.

**T87. Memcached or Redis for this? What is the actual decision criterion?** `TRICKY`

Criterion: **do you need anything Memcached does not do?** Memcached is a single-threaded
in-memory key-value store with a small, stable, well-understood item format, per-item
expiry, an LRU, and a very high hit rate under a simple get/set workload — and it is
genuinely simpler to run and to reason about. Redis is a data structure server: hashes,
lists, sets, sorted sets, streams, Lua scripting, pub/sub, transactions, persistence,
replication and clustering. So if the cache is only `GET`/`SET` of whole values, Memcached
is the better answer — less memory per item for small values, simpler failure modes, and no
surprises. Redis wins the moment the cached value is anything other than an opaque blob
(any of: a per-key field update without a read-modify-write race, a set for a
deduplication check, a sorted set for a leaderboard or a rate limiter, a stream for a
lightweight queue), and the moment you want the cache to participate in a script
atomically. The counter-consideration people forget: Memcached's simplicity includes *no
persistence and no replication*, so a restart is a cold start, whereas Redis's
`appendonly` gives you recovery at a cost — so if the cache's contents are expensive to
rebuild, that changes the answer too.

**T88. Your service makes 30 Redis calls per request. What is the problem and what do you
do?** `TRICKY`

Latency and pool pressure. Thirty round trips at even 0.5 ms each is 15 ms of added
latency per request, entirely serialised if the calls are sequential, and it consumes 30 of
your connection pool's slots per in-flight request, so the pool size — and therefore the
database pressure — is thirty times what the design assumed. Three fixes, in order. **(1)
Pipeline the calls**: send them in one write and read all the replies in one read, which
collapses the round trips to roughly one and is usually a 5–20× improvement with no semantic
change, provided none of the calls depends on another's result. **(2) Combine them**: a Lua
script that returns several values atomically, or a single `HMGET` instead of three
`HGET`s, or one `MGET` instead of five `GET`s — this is strictly better than pipelining when
the calls are on the same key or hash slot, and it is also the only way to make a
read-modify-write atomic. **(3) Fix the design**: thirty calls usually means thirty
round trips of a graph traversal or an N+1 over the cache, and the right fix is usually a
different data layout — cache the *object* rather than its parts, or a denormalised read
model — not a faster client. And the check that catches it: `SLOWLOG` and
`latency-per-sec` will show the pattern, and the pool will show the pressure. The rule to
state: a cache that is hit thirty times per request is not a cache, it is a distributed
in-memory database, and the design should be changed rather than the client tuned.

**T89. Should you `SCAN` or `KEYS` to enumerate a large keyspace, and what else is wrong
with key enumeration at scale?** `TRICKY`

`KEYS` is `O(N)` over the whole keyspace and **blocks the single server thread** for the
duration, so on a large database it freezes every other client — it is effectively a
`DEBUG SLEEP` with a result. `SCAN` is the cursor-based alternative: it returns a bounded
batch, guarantees that every element present for the whole duration is returned at least
once, but may return duplicates and may miss elements added or removed during iteration.
Those guarantees are the right ones for an enumeration that is racing with writes, and they
are why `SCAN`'s count is a hint rather than a promise. But the deeper point is that
**enumeration is a smell**: a client that has to ask Redis "what keys exist" is missing an
index, because the right structure is a set of ids or a sorted set of members so the
membership question is a range read rather than a scan. If you genuinely need to enumerate,
tag your keys with a common prefix and use `SCAN MATCH prefix:* COUNT n`, and remember that
`SCAN` in a cluster must be run per node. And the honest alternative for large keyspaces:
a separate index — a set holding the key names — so enumeration is `SMEMBERS` on a bounded
structure rather than a scan, at the cost of maintaining it on every write.

### Cassandra, DynamoDB & MongoDB

**D25. A team is choosing between DynamoDB and Cassandra for a globally distributed
workload. What are the questions that actually decide it?** `STAFF`

Not the comparison table — the questions. **(1) Can you enumerate the access patterns now?**
Both are query-limited stores where the schema *is* the query list, and both punish an
unmodelled query with a full scan, so the deciding factor is whether the access patterns are
committed before the code is written. **(2) Who operates the topology?** This is the biggest
real difference: Cassandra is self-managed or available from few operators, and you choose
replication, token allocation, consistency and upgrade cadence; DynamoDB is fully managed
with global tables, Streams and on-demand capacity, and you give that up. With no
distributed-systems operators, that is decisive. **(3) What consistency do you actually
need?** Cassandra is tunable per query across `ONE`/`QUORUM`/`ALL` with a quorum
calculation you control, and a multi-DC `LOCAL_QUORUM` is a real strong-ish read you can get
cheaply; DynamoDB gives binary eventual or strongly consistent (double cost, never on a
GSI) plus **transactional writes across items and tables**, which Cassandra deliberately
does not offer and which is decisive if multi-item invariants exist. **(4) What is the
repair story?** Who fixes a bad row, and how long until it is fixed — DynamoDB Streams and
on-demand repair make it managed, Cassandra makes it a compaction and repair problem you
operate. **(5) Workload shape**: Cassandra's append-only, partition-local write path suits
high-volume time-series and event data extremely well; DynamoDB's single-digit-millisecond
`GetItem` and transactions suit low-latency key-access workloads. **(6) Multi-region
writes**: DynamoDB global tables give multi-region read with conflict resolution you must
design for; Cassandra's cross-DC replication is asynchronous, so a multi-DC quorum read is a
real consistency compromise. And the honest close: if this is a key-value lookup with a
handful of access patterns and a small team, DynamoDB's zero operational cost is worth more
than Cassandra's control, and the reverse holds if you have operators and a workload
Cassandra's write path is genuinely better at.

**D26. MongoDB is the proposed system of record for a feature that also needs full-text
search and a few strong cross-document constraints. What would you change, and what would
you keep?** `STAFF`

The shape of the answer: MongoDB's flexibility and scale are real, and the absence of
constraints is the actual limit. What I would keep: MongoDB if the document model genuinely
matches the access pattern (embedding rather than joining), if the volume justifies it, and
if the team can run a replica set properly. What I would change. **(1) Move cross-document
integrity out of the application.** There are no foreign keys, so every referential
guarantee is code in every write path; a JSON Schema `validator` is the mechanistic
minimum. The rule is that invariants go **inside** a document, never across documents — if
an invariant spans two collections, that is a signal they should be one document or that the
relationship belongs in a relational store. **(2) Add full-text search to a search engine.**
MongoDB's text index is adequate for a modest corpus and inadequate for anything users
expect from search: no relevance tuning, no analyzers, no highlighting, no aggregation over
matches. That is a textbook Elasticsearch projection, indexed from a change stream, with the
staleness contract written down. **(3) Replace `skip` pagination** the moment anyone uses it
on a large collection, with a range predicate on a stable, unique sort key. **(4) Re-examine
the write concern** — `w:1` loses data on a failover and `w:"majority"` is the default you
probably want, so "we are on the default" is a real answer. The staff summary: the question
is whether the absence of constraints is a freedom or a constraint on this workload. If every
write goes through one service, "no foreign key" is fine. The moment a second service or a
pipeline writes, it is not.

**T90. `PRIMARY KEY ((country, day), sensor_id)` and you need "all readings for one sensor
on one day". What do you do?** `TRICKY`

You cannot do it efficiently, and that is the point of the exercise. `sensor_id` is a
**clustering column**, and clustering columns can be restricted only in ways that preserve
the partition's sort order — you can take an ordered *range* of clustering columns, but you
cannot skip to an arbitrary one. So restricting `sensor_id` while leaving the leading
clustering position free is not a supported efficient query, and the workaround — querying
the day and filtering on `sensor_id` client-side — reads a partition that is one of the
largest in the cluster. The fix is a **second table**, `readings_by_sensor((sensor_id, day),
ts, value)`, written by the same mutation. This is not a workaround, it is *the* Cassandra
design pattern, and the cost is that the write now touches two tables and a partial failure
between them leaves them inconsistent, which is why these tables depend on repair and
hinted handoff to converge. The rule: **every query you can imagine is a table**, the schema
is designed from the query set rather than the entity model, and the first version always
needs more tables than expected because the queries always multiply.

**T91. A DynamoDB table's partition key is `customer_id`, and one customer is 40% of read
traffic. What are the options, and what does that say about the data model?** `ADVANCED`

The immediate fix is **adaptive capacity**, which allocates capacity per partition and can
split a hot one, and on-demand billing simply pays for the read. That handles throughput but
not the hard limits: a single item over 400 KB fails outright, and per-partition throughput
and per-item size are ceilings that no amount of capacity tuning removes. So the real
answers are at the data-model level. **Composite partition key** — `customer_id` plus a time
bucket or a sub-entity id, e.g. `(customer_id, order_id)` — spreads one customer's data
across many partitions and is close to free if the access pattern tolerates it. **Hierarchical
key** — `customer_id` as a delimited prefix such as `CUST#123#ORD#456` — keeps the
customer's items logically grouped, lets DynamoDB split on the common prefix, and makes
"all items for a customer" a `begins_with` query. **Vertical partitioning** into a profile
table and an orders table, which is what the model probably wanted. And a **cache**, which
for a hot read is usually mandatory, because it is the only answer that removes the read from
DynamoDB entirely. The staff framing: a single hot partition is a *data-model* failure that
throughput tuning papers over until the item-size or partition limit is hit, so the design-time
question is "where does the largest and hottest entity in this system put its partition
key" — and the answer is usually "all in one partition, which is the whole problem".

**T92. DynamoDB's four consistency options, and when do you actually need a strong read?**
`TRICKY`

`ConsistentRead = true` on a `GetItem` or `Query` gives a strongly consistent read returning
the most recent write, at **double the read cost**, and it is **not available on a global
secondary index**, which is always eventually consistent. The default `false` is eventually
consistent at half the cost. The rule people get wrong is about *which* key: eventual
consistency is a **per-item** guarantee, so an eventually consistent read can return a
replica state that is stale for each item independently — you can get item 3 at time T and
item 7 at T−5 seconds, and you can get back a value you have already read. So it is not
"eventually the same, in order"; it is "some recent valid state, per item, unordered". When
do you need strong reads? A read-after-write the user is watching; an idempotency check
before acting, where a stale read would cause a duplicate; and a uniqueness claim. But the
strong answer to the last two is a **conditional write** rather than a strong read:
`attribute_not_exists(pk)` in a `PutItem` condition expression claims the key atomically, in
one operation, at one unit of cost, and it fails rather than duplicating. So the rule is:
you need strong consistency for the *decision*, not the *data*, and the decision should be a
conditional write.

**T93. A MongoDB `find` over 200 million documents takes 40 seconds despite an index on the
filter field. What are the causes, in the order you check them?** `TRICKY`

In check order: **(1) the index is not used** — `explain("executionStats")` showing
`COLLSCAN` rather than `IXSCAN`, because the predicate does not match the index (a
leading-wildcard regex, a `$ne` or `$nin` on the indexed field) or because of type
bracketing, where filtering `{"a": 1}` cannot use an index on `a` when the field is
sometimes an array or a string in other documents, since the index does not record the type
and the scan has to widen. **(2) the index is not covering** — `FETCH` in the plan means one
document fetch per matched index entry, so the read is a random I/O per result; the fix is a
covering index or a `covered` projection, which requires the projection to reference only
indexed fields. **(3) the sort is not covered by the index**, so MongoDB sorts in memory and
hits the 32 MB limit rather than spilling. **(4) the result set is genuinely huge** — 200,000
documents returned to the application is a pagination problem, and `skip` is O(n) like SQL
`OFFSET`, so use a range predicate on the sort key. **(5) the query is unindexable as
written** — `$or` across fields, unanchored `$regex`, or `$ne` — which is why `$in` is
index-friendly and `$nin` is not. **(6) the index itself is the problem** — too many
indexes makes every write expensive, a low-cardinality leading column makes it useless, and
an index still building is not usable. The order is deliberate: establish that the index is
used and covering before assuming the data is at fault, because the first two account for
most cases and cost one `explain` to check.

**T94. Cassandra tombstones — what are they, why does the count matter, and what are the
two ways to get a lot of them?** `ADVANCED`

Every delete and every expired-row-marker is a **tombstone**: a marker left in the SSTable
so the read path knows the row is gone. They are not free. They must be kept until
`gc_grace_seconds` has passed since the delete, because a replica that was down for longer
than that could return the resurrected data — so a tombstone is retained for at least the
**repair window**, and they are read on every read of that partition, they are counted in
the read path, and they are only dropped at compaction. The two ways to accumulate them are
**deletes on a table with a short TTL**, because each row then leaves a tombstone that
lives for the TTL, and **tombstone-heavy workloads on high-churn partitions**, where
compaction cannot keep up with the write rate so the tombstone count climbs. The symptom is
a "too many tombstones" warning, query timeouts that get worse over days rather than
minutes, and unbounded disk use. The mitigations: avoid short TTLs on wide partitions,
prefer `DELETE` with a long TTL to a table-level one on a row you never read, and — the
real fix — **tune `gc_grace_seconds` and compaction** so tombstones are dropped promptly, or
use a **time-window / date-partitioned table** so tombstones age out with the data. The
staff point: tombstone count is a capacity metric, not a curiosity, and a table that is
fine at 1,000 rows a second is not fine at 100,000.

**T95. What is a lightweight transaction in Cassandra, and what problem does it exist for?**
`ADVANCED`

A Paxos-based consensus protocol (in Cassandra 2.0+, "compare and set") that lets a
statement read the current value of a row, apply a condition, and write it back with
**per-partition linearizability and a consistency of your choosing** — without a
coordinator bottleneck, because the coordinator only proposes; the replicas agree. It
exists because the ordinary `UPDATE ... IF NOT EXISTS` is *not* atomic across the
replication: it is a read followed by a write at some consistency level, and two clients
racing it can both insert. The LWT makes that insert-if-absent atomic. The costs are
severe and they are why LWTs are rare in practice: each one is a **Paxos round**, which is
2 to 3× the latency of a normal write, it requires **all replicas in the quorum to be up**,
so it degrades badly during a partial outage, and it is only linearizable **within a single
partition** — so a multi-partition conditional write is not a single LWT but several, and
between them there is no atomicity. That last point is the one that surprises people: you
cannot take a lock or a uniqueness guarantee across two partitions. So the design guidance
is to design the schema so the invariant fits inside one partition, use the partition key as
the mutual-exclusion unit, and reserve LWTs for the rare genuinely-crossing decision.

**T96. A Cassandra read at `ONE` versus `QUORUM` — what actually changes?** `ADVANCED`

`ONE` is a single replica reading its local data and acknowledging immediately: the fastest
and the most available, and correct only for a value that is idempotent or reconstructible —
a cache, a derived aggregate, a counter display. `QUORUM` (or `LOCAL_QUORUM` in a
multi-DC deployment, which restricts the read to the local data centre) reads
`RF/2 + 1` replicas and reconciles them, so it repairs a stale or divergent replica **as a
side effect of the read**, and it returns the value with a consistency guarantee you can
name. The cost is latency that scales with the round trip to the *slowest* of the replicas
plus a read-repair write, and the availability cost: `QUORUM` cannot be served when fewer
than the quorum is up, so it fails during exactly the partial-node failures where you wanted
to keep serving. `LOCAL_QUORUM` in a multi-DC topology additionally stops the read from
waiting on a remote data centre, which is the difference between a 2 ms and a 150 ms read —
and the reason cross-DC `QUORUM` is almost always the wrong choice. The rule: pick the
lowest consistency that is correct for the data, because every step up costs latency and
availability, and the reason `QUORUM` is under-used in practice is that teams default to
`ONE` for everything rather than reasoning per column. The corollary: the *write* consistency
is a separate decision, and a `ONE` write read at `QUORUM` is a read that waits on
reconciliation rather than a read of fresh data.

**T97. What is the 16 MB document limit in MongoDB, and what is the right response to hitting
it?** `TRICKY`

A BSON document must be under 16 MB, because the document is the unit of atomicity, the unit
the storage engine's record layout is built around, and — the hard reason — a single document
must fit within the replication oplog entry and the `find`/`insert` message size limits that
older drivers used. The wrong responses are truncating arrays silently, which loses data, and
moving the big attribute to S3 and storing a pointer, which is correct but needs its own
lifecycle. The right responses, in order of preference. **(1) Model it properly**: an array of
a million items in a document is almost always a modelling failure; if it is a list of
things each with its own identity and lifecycle, it is a **separate collection** with a
foreign key, and the query becomes a join you do with a second query plus
application-side stitching or `$lookup`. **(2) Chunk the array** across a set of documents
with a chunk index, reassembled on read — the correct answer for a genuinely large
unstructured list, and a pattern you should recognise early because retrofitting it is
painful. **(3) `GridFS`** for files, which chunks a large binary across a `chunks`
collection with a `files` collection as the descriptor; the interface is clunky and the right
answer is usually object storage with the grid reference. The staff point: a 15 MB document
is a signal that the document is doing a relational job, and the fix is a schema decision
rather than a storage workaround.

**T98. DynamoDB TTL, Streams, and the questions you should ask before using either.**
`ADVANCED`

**TTL** deletes an item when the attribute's epoch-seconds value passes. Three things to
ask. (1) Deletion is **eventually** done — typically within about 48 hours — so TTL is for
data you are willing to keep a while longer, not a precise scheduler. (2) Deletion **consumes
write capacity** and competes with real traffic, so a large TTL sweep is a workload spike you
should plan for rather than discover. (3) A TTL on an item that is continuously refreshed
never expires, which is correct and also means a bug where the refresh is unconditional is
invisible until the data volume grows. So TTL is a **retention mechanism**, and a good one:
it is the cheap way to implement data expiry without a cron job, and it is far better than a
scheduled `DELETE` that scans a table. **Streams** capture a per-item, ordered (per
partition-key) change log, delivered to consumers for a retention window. The questions:
what is the consumer, and what happens if it is down for longer than the retention window,
because those changes are gone; does the consumer process **idempotently**, because
at-least-once delivery means it will see events twice; and does anything else read the same
stream, because a stream has one set of shard iterators and consumers compete rather than
each getting every event. The pairing to remember: TTL for what to stop keeping, Streams for
what to react to, and a projection built from Streams needs its own checkpoint and rebuild
path, or it becomes a second source of truth nobody can reproduce.

**T99. A Cassandra cluster is slow and you suspect the tombstones, but the read is at
`ONE`. Why is the diagnosis hard, and what do you do?** `ADVANCED`

Because at `ONE` the read is served by **one** replica's memtable and SSTables, and
performance there is a function of that replica's state — its tombstones, its sstable count,
its pending compactions, whether it is behind on the commit log or hinted handoff backlog —
and that varies replica to replica, so the "slow query" is slow for some keys and fast for
others with no pattern the application can see. The tombstone count is also not
representative: reading at `ONE` may hit the replica that is not the one accumulating
tombstones, and the symptom (timeouts that worsen over days) is caused by the *cluster*
compacting, not by the read. So the investigation has to move to the cluster level: the
per-replica `ReadCount`/`SSTablesPerRead` distributions, the compaction queue, the tombstone
count per table, the `nodetool status` view of pending tasks, and the commit-log
`OperationsPending`. The fixes, once you have numbers, are compaction tuning and
`gc_grace_seconds`, more table splits, a longer or absent TTL, or a schema change to
date-partitioned tables so old data and its tombstones age out. The staff point: the
difference between a read you can explain and one you cannot is whether the read is
*deterministic*, and at `ONE` on a heterogeneous cluster it is not — which is one more
argument for reading at `QUORUM` on data you care about.

### S3 & Elasticsearch

**D27. A team wants 2 billion searchable product documents in Elasticsearch. What do you
check before agreeing, and what do you make them promise?** `STAFF`

Four numbers, and if any is missing I would not say yes. **(1) Document count and the
`doc_values` footprint** — the heap requirement is driven by field cardinality, not raw
document size, and the rule is to keep all of it off the heap: `doc_values` are on disk and
columnar, `_source` is compressed and on disk, and the in-heap structures are the terms
dictionary and postings, so per-shard heap is a fraction of on-disk size. The number to
insist on: **all shards' data fits comfortably below roughly half of heap per node**; if it
does not, the fix is fewer fields, fewer indexes, or `_source: false` with re-insertion from
the source of truth. **(2) The query patterns** — filters, aggregations and sort keys — since
every field you sort or aggregate on needs `doc_values` and every field you search needs
postings, and those are not the same set. **(3) Write rate and indexing strategy** — 2
billion documents implies a bulk-throughput budget, and one-document-per-request or a
1-second refresh during the load will not make it, while the bulk API with a negative
refresh interval and aliases for cutover will. **(4) Staleness contract and reindex path** —
how it is populated, how often, and how it is rebuilt. And the promises to extract in
writing: a **shard count chosen from a forecast** (target 10–50 GB per shard), because shard
count is only changeable by reindexing; **routing** decided deliberately by tenant or a hash
so one tenant cannot take a node down; an **explicit mapping with `dynamic: strict`**, because
a mapping explosion at 2 billion documents is a disk-fill outage and it happens without
anyone changing the schema; **separate indexes per data type**, so they can be deleted or
reindexed independently; an agreed **retention**, because a search index is the easiest place
to accumulate data nobody owns; and, most importantly, that the **source of truth is
elsewhere**, so this is a projection with a rebuild path. If "how do we rebuild this" has no
answer of "replay from the source", I would push back on the project.

**D28. A nightly job writes 500 GB to S3 and reads most of it back the next day from a
different region. Walk me through the storage-class and egress reasoning.** `STAFF`

This is a case where four billable axes fight each other and the answer is that lifecycle
rules are the wrong mechanism. First: writing and reading back in the same region means the
object should never leave `STANDARD` or `STANDARD_IA` at all, because every transition to an
archive class incurs a per-GB **retrieval charge** on the read-back and, if the read happens
inside the class's minimum duration, an **early-deletion charge** — so a nightly
write-and-read pipeline that transitions at all pays a premium to end up where it started.
Second: if the data is written once, read once, and the source is then dropped, that is an
**archival** workload, not a pipeline, and the right answer is to write it straight to the
archive class and never read it back — cheap classes are cheap *because* you do not read
from them. Third, and this is the axis that dominates: **the cross-region read is the whole
cost**. Egress is billed per GB with a tiered structure, and at 500 GB a night it is a large
number, while a month of storage-class differences is a few thousand dollars — so reframing
the question from "which storage class" to "how do we avoid moving 500 GB across a region
boundary" is the entire answer. The options, in order: replicate *after* processing so the
raw data never crosses; process in the region where the data is produced; export a
**derived aggregate** instead of the raw data, typically 1% of the volume; or, if a full copy
is genuinely required, use lifecycle transitions for anything unread after N days, with
`DEEP ARCHIVE` for the tail — accepting the minimum duration because the data really is
archival. And the operational half: turn on **Storage Lens** with a prefix breakdown, because
at 500 GB a night the question "which prefix costs what" is what finds the real problem, and
a large egress line on one bucket is frequently one misconfigured lifecycle rule moving a
whole dataset for a workflow that reads it daily.

**T100. A 40 TB bucket holds 300 million small files averaging 130 KB. Break down the
bill.** `ADVANCED`

Four billable axes. **Storage** is 40 TB in `STANDARD` and is the easy one. **Requests** is
where it goes wrong: 300 million objects means every GET is a billable request, priced per
1,000, so a workload that reads 300 million objects is buying 300 million units of
request. **Retrieval and lifecycle**: objects that transitioned to `INTELLIGENT_TIERING` or
`GLACIER` and are read back pay a per-GB retrieval fee, and if a fraction of the archive is
read repeatedly, retrieval can exceed the storage it saved. **Egress** if any of it leaves
the region, and at 40 TB sustained that is the number that actually kills budgets. Two
surprises worth naming: the objects are 130 KB, just over the **128 KB minimum billable
size** for the IA and archive classes, so they are billed at 128 KB — the same rule that
makes a store of 4 KB files cost as much as 128 KB files; and if any automation enumerates
these objects by prefix, a `LIST` returning 1,000 keys per page against a 300-million-object
prefix is 300,000 requests just to enumerate. The general lesson from Chapter 3: at small
object sizes the *request* and *egress* axes dominate, and choosing a storage class without
counting reads is choosing on the axis that matters least.

**T101. A lifecycle rule moves objects to `GLACIER FLEXIBLE RETRIEVAL` after 30 days. What
happens when you read one back, and what should the rule have said?** `TRICKY`

Per object: a `Restore` request (a billed request), then a **data retrieval charge per GB**,
and a **retrieval duration of minutes to hours** rather than the 3–5 hours of `DEEP
ARCHIVE` — so this class is the "minutes" archive, not the "hours later" one. For a
handful of files the absolute cost is trivial; the number that matters is that at 100,000
files or 40 TB, retrieval is a real line item and can exceed the storage it saved. The rule
should have said: (1) a transition age that is genuinely an **archive** age — 30 days is
inside the early-deletion window, so the rule is quietly promising permanence the data does
not keep; (2) a `DEEP ARCHIVE` transition for the cold tail, so the second tier is
dramatically cheaper; (3) transitions restricted to objects **above 128 KB**, below which
they are pointless; and (4) an **expiration** rule for the same population, because an
archive with no expiry is a place data goes to and is never deleted. The general form: a
storage class is a joint decision about cost, restore latency, and minimum duration, and the
minimum duration is the part teams forget and pay for.

**T102. A 3-node Elasticsearch cluster, 5 shards, 1 replica, `yellow` health. What is
wrong?** `TRICKY`

`yellow` means every primary is allocated but at least one replica is not, and with 3 nodes
and 5 shards that is arithmetic, not failure: 5 primaries cannot be spread over 3 nodes with
1 replica each, because each node needs a full copy of every shard, so 3 nodes need 15 shard
copies and only 10 exist. The allocation is not broken — the topology is impossible. Ways to
`green` without dropping to zero replicas: **add a node** (a 4th node makes 10 shard copies
fit), **reduce the primary count** to 3 or 2, which is a reindex or a split rather than a
config change, or set `number_of_replicas: 0`. The honest way to say that last one: it is not
redundancy for free, because a node failure then loses data unrecoverably. The lesson is that
**shard count must be a multiple of the node count** when you want full redundancy, so a
3-node cluster wants 3, 6 or 9 primaries per index — and 5 is the number someone produced by
rounding a size estimate, which is exactly the mistake. Also worth saying: `yellow` is
usually benign and `red`, an unassigned *primary*, is the emergency.

**T103. A user searches "running shoes" and gets nothing, for a document whose description
reads "Great for running and walking". Why?** `TRICKY`

The default analyzer split both the document and the query into "great", "for", "running",
"and", "walking" and dropped the stop words — and "shoes" does not appear in the document at
all, so it matches nothing. Since a `match` query is an `OR` by default but here the
*default operator* plus the document's own contents means the query effectively requires the
distinctive term, the miss is silent and total. The chapter 7 diagnosis applies directly:
query for a single distinctive term rather than a phrase, or set `operator: "or"` on the
`bool` so any term can match, or apply a **synonym set** — which must be applied at *index*
time as well as query time, or the two sides will not agree, and that is the most common
reason a synonym "fix" appears to do nothing. The second thing to check in a real
investigation is the **unmapped field** case from Chapter 7: if the field name in the query
is not the field name in the mapping, the query returns zero results with no error, and the
field may have been indexed under a dynamically-generated name because of a mapping
explosion. `?explain=true` on the query identifies which of these it is in one call, and
that is the correct first step rather than guessing.

**T104. A 900 GB Elasticsearch index, 40 shards, 1 replica, 8 data nodes. Shard rebalancing
never settles and ingest p99 is 8 seconds. What is happening and what do you change?**
`ADVANCED`

Three interacting problems. **Too many shards** — 900 GB over 40 shards is about 22 GB
each, at the *small* end of the 10–50 GB target, and shard *count* is what costs rather
than shard size: every shard consumes heap on every node, adds segments and file handles,
and adds to cluster-state and cluster-health overhead. 80 shard copies across 8 nodes is 10
per node, and any node-membership change or auto-expansion triggers continuous
reallocation that competes with ingest. **Refresh is being paid on the primary path** — a
1-second refresh opens a new segment, and with 40 primaries producing segments the merge
pressure and I/O are constant, which is the 8-second p99. **Merge pressure** compounds it,
and any node crossing a disk watermark (roughly 85% allocation-blocked, 90% read-only, 95%
index read-only) stalls allocation and presents exactly like this. The changes, in order:
**(1) raise `index.refresh_interval`** to 5 or 30 seconds if the use case tolerates it —
the single largest ingest win available, and a pure latency-for-throughput trade;
**(2) increase `index.translog.sync_interval`** to decouple the flush interval from the
commit interval for bulk ingest; **(3) reduce the shard count** by reindexing into a
better-shaped index and cutting over, which is the only irreversible-ish step and belongs in
a planned window; **(4) separate ingest from search** with a replica tier or a second
cluster, so the write and read node pools differ. The staff point: shard count is the least
reversible decision in Elasticsearch because it can only be changed by rebuilding the index,
which is why it is chosen from a forecast rather than from a current size.

**T105. A search index is 20× larger on disk than the source data. Where is the space?**
`TRICKY`

Five places, and the two biggest are not the ones people expect. **The index itself**: the
postings for every analysed field plus the terms dictionary, which for high-cardinality
fields such as an order id or a UUID analysed as text is enormous — one dictionary entry and
a posting list per distinct token, and a tokenised UUID is a disaster because the default
standard analyzer splits it into many sub-tokens. That field should be a `keyword` and
should never have been analysed. **`_source`**: the original document, stored per document,
which for a document that is 2 KB of JSON with long fields is 2 KB per document forever,
plus compression overhead; `_source` is commonly several times the size of the postings and
is the thing to attack first. **`doc_values`**: a columnar copy of every field that is
sorted, aggregated or scripted, and on a high-cardinality field that is another full copy of
the data. **Deleted documents and segments**: deletes leave tombstones and the space is
reclaimed only at merge, so a churny index holds a large ratio of dead data until a merge
completes. And **a mapping explosion**: dynamic mapping on unconstrained input creates a
new field — and a new column of `doc_values` — per unexpected property, and at 300 million
documents that is a disk-fill outage nobody caused deliberately. The diagnostic order:
`_cat/indices` with the store breakdown, then the field-level `fielddata` and
`doc_values` sizes from the nodes stats API, then the mapping for unexpected fields. The
two fixes with the best ratio are mapping unconstrained payloads as `flattened` or `enabled:
false`, and turning `_source` off where the document can be re-fetched from the source of
truth.

**T106. The ETag of a multipart-uploaded object does not match the MD5. Is something
wrong?** `TRICKY`

No, and the reason is worth being precise about. For a **single-part, unencrypted,
SSE-S3** upload, the ETag is the MD5 of the object. For a **multipart** upload, the ETag is
the MD5 of the **concatenated binary MD5 digests of each part**, suffixed with a dash and
the part count — so `d41d8cd98f00b204e9800998ecf8427e-17` means 17 parts. It is not the MD5
of the object, so `md5sum` will never match it, and that is expected rather than a
corruption signal. Two further wrinkles: any object encrypted with **SSE-KMS or
SSE-C** also has an ETag that is not the object MD5, because the ETag is computed over
ciphertext; and since late 2024 S3 applies a **default CRC-64NVME checksum** to new
objects, so `ChecksumAlgorithm` and `ChecksumCRC64NVME` are what you should verify against
rather than the ETag at all. The correct verification strategy: send a `ChecksumAlgorithm`
on the `PutObject` or `CompleteMultipartUpload` and verify the returned checksum, or compute
and send your own `x-amz-checksum-*`, and treat the ETag as an opaque identifier plus a
multipart detector. And note that the part count in the ETag is a useful operational
signal in its own right — an object with 500 parts was uploaded with a part size chosen by
someone who did not think about it, and small parts cost requests and, if under the 5 MB
minimum, are rejected outright.

**T107. We presigned a URL for a user and it stopped working. What are the four things that
can invalidate a presigned URL?** `ADVANCED`

Four, and they are all consequences of SigV4's design. **(1) The signing credential's
expiry** — a presigned URL is scoped by the access key's own permissions *and* its expiry,
so a link signed by a key that expires in an hour stops working in an hour, regardless of
`X-Amz-Expires`, which caps the URL's validity at 7 days but cannot extend the credential's
own life. This is why a long-lived presigned URL should be signed by an **IAM role's
temporary session credentials**, and why rotating those credentials invalidates every link
in flight. **(2) The clock skew**, because SigV4 requires the signing time to be within a
window of the service's clock; a host with a drifting clock produces `SignatureDoesNotMatch`
that looks like a code bug. **(3) The credential's permissions changing** — removing the
`PutObject` grant revokes every URL already issued, because authorisation is evaluated at
request time, not at signing time. **(4) The expiry itself**, obviously, and the
`s3:signatureAge` policy condition if the bucket policy is tighter than the URL. The
practical guidance that follows: presign for the shortest useful lifetime, presign from a
role rather than a long-lived IAM user so rotation does not break live links, use
conditions and short lifetimes rather than a broad grant, and — the Chapter 4 point — never
presign a prefix or a wildcard, because the signature does not narrow the key and the grant
does.

### The Design Round

Fifteen design trade-offs, each asked as the follow-up rather than the first question,
because the first question has a memorised answer and the follow-up does not.

**D29. Your team wants to shard the `orders` table. Ask the questions that would convince
you, and say what makes sharding reversible.** `STAFF`

The questions first, because asking them is the point: what is the current size and the
*growth rate*, so sharding is justified by a projection and not a bad afternoon? what is the
read pattern — one order, all of a customer's orders, or an aggregate across a range? what
is the write rate and the peak? and crucially, is the thing you are about to shard a scaling
problem at all, or a missing index, a long transaction, a bad plan, or a table that should
be partitioned by time? The reversibility answer: **application-level sharding with the
shard-key function in one place is reversible** — you can re-shard by changing the function,
and the rebalancing is a data-movement job you schedule. **Physical sharding by range, or
partitioning by a key hard-coded into every query, is not** — the key becomes part of every
query, maintenance procedure and future constraint, and changing it is a data migration
under load. **Native sharding is a different kind of irreversible**, because the split is
managed for you but you have accepted the engine's query model permanently. The follow-up
answer that lands: the shard key is the one decision you cannot walk back, so choose it not
by "what balances" but by "which key is every query already grouping by" — a key that
matches the dominant query is a scale-out, and one that does not means a distributed join
on every request. The test: on a sharded system, is every query scoped to one shard, or are
you accepting a fan-out as a permanent cost?

**D30. You have 400 million rows and a 90-second p99 on one report. Walk me through what you
would do in order, and which step is hard to undo.** `STAFF`

(The harder form adds a constraint: *the report must keep returning the same numbers, the
table is on a primary serving 40,000 queries a second, and you have one maintenance window a
month.* That constraint removes most options and forces the real argument.) The order:
measure with `EXPLAIN (ANALYZE, BUFFERS)` on the real query with real parameters, because a
90-second p99 is a symptom and the cause could be a stale statistic, a missing index, a
fan-out or a `DISTINCT` on a high-cardinality column — one of which is an afternoon's work.
Then index the implied access pattern. Then fix statistics if the estimate-versus-actual gap
is large. Then make the access index-only. Then materialise it, accepting a stated staleness
bound. Then move it to a read replica, which takes it off the OLTP path entirely. And only
then partition by a date or key range. **The step that is hard to undo is partitioning, and
specifically the partition key** — it costs a project undertaken on an estimate, it lands
under load, it changes the physical layout and the unique-constraint rules, and it locks in
a query shape. Everything before it is an index, a statistic, a view or a replica, and all
four can be dropped in a second. Under the added constraint, the read replica and the
materialised view are achievable and the partition probably is not — so the correct answer
*under the constraint* skips the irreversible step, and saying so is the difference between
someone who has memorised a playbook and someone who can reason about reversibility.

**D31. Your team wants DynamoDB because it scales and you do not think it fits. What do you
ask them — and what do you do if the answers are good?** `STAFF`

The questions are what matters, and the good ones are all about the query model rather than
scale. **(1) Enumerate the access patterns** — every query, with its keys. If the answer is
"we will figure it out", that *is* the answer: there is no secondary index that behaves
like a relational one, a GSI is a whole second copy with its own throughput cost and is
*always* eventually consistent, so the model doubles. **(2) Which queries must be
transactional or strongly consistent?** More than one item at once with an invariant between
them is a reason to reconsider — `TransactWriteItems` costs 2× and does not cover a
cross-document join. **(3) What is the data model?** A DynamoDB item is a map; if the entity
is naturally relational and narrow you are paying for flexibility you do not use, and you
will end up storing the join in the item, which is the denormalisation decision arriving
early and unexamined. **(4) What happens when the data changes?** In a relational store a
migration is a transaction; here it is a pipeline you must build and run. **(5) Who is on
call and what does a mistake cost?** Partial `BatchWriteItem` success, a throttled reindex,
a TTL that expires data nobody expected — these are operational surfaces a database does not
have. **(6) What does it cost now, and at ten times the volume?** And if the answers are
good — access patterns enumerated, consistency satisfied by conditional writes rather than
strong reads, the model maps to items, the reindex pipeline and the per-item size limit
accepted — then the correct action is to support it. A candidate who cannot be talked out of
a well-reasoned decision is as wrong as one who blocks it on instinct. The framing to use:
I am not arguing against DynamoDB, I am arguing that the query model must be known before
the storage is chosen, and if it is known, the choice is probably right.

**D32. A replica is 30 seconds behind and the primary is at 40% CPU. Reads from the replica
are getting *slower*. Explain, and what do you do now?** `STAFF`

The feedback loop is the explanation. The replica serves reads *and* applies the WAL; a
read-heavy workload starves its apply thread, so it falls further behind; a replica that is
behind is both a bad read target and, because it holds MVCC snapshots, a **blocker of purge
on the primary** — so the primary bloats and slows too. Reads that go somewhere slow retry
elsewhere, and if the retry policy sends them to the primary when the replica is stale, the
primary's load goes *up*, which is exactly how "the replica is slower than the primary"
happens. The immediate actions: **stop the feedback loop** with a circuit breaker or a
deliberate fraction of reads to the primary, rather than letting retries amplify; **find
what is on the replica's apply thread** — a long-running query or a large transaction on a
replica holds its snapshot and stalls apply indefinitely, and this is the single most common
cause; **check the primary's WAL volume**, because 10× the normal rate means the lag is
downstream of write pressure and the fix is upstream; **check for a long transaction on the
primary** pinning the replica's ability to advance; and **check whether the replica is
I/O-bound**, which is a sizing problem rather than a tuning problem. The structural answers:
alert on lag rather than reading lag after the fact, put read-only reporting traffic on its
own replica so a scan cannot stall the one serving user requests, and never use a replica
for read-your-writes without checking lag first. The staff framing: replica lag is a symptom
with a common cause in MVCC, and the team that puts `Seconds_Behind_Master` and purge counts
on the same dashboard catches this in minutes.

**D33. A team proposes a cache in front of everything, and "everything" means every query.
Your response, and the rule you would give them?** `STAFF`

That a cache in front of every query is not a caching strategy, it is a second database with
weaker guarantees and a distributed invalidation problem attached — and the team should be
able to name, for each cached query, **what invalidates it and what happens if the
invalidation is lost**. That question, asked of every candidate cache, is the entire review.
Then the tiering: cache **reads**, not writes; cache **expensive** reads — a read is worth
caching if it is a small fraction of the volume and a large fraction of the cost, and a
query that is 40% of your traffic should be fixed with an index, because a cache in front
of a hot query just moves the load; cache **repeatable** reads, since a read that differs
every time gets a 0% hit rate; and prefer a **materialised projection** over a cache when
the read shape is non-trivial, because a projection can do the join and the aggregation once
instead of per request. The rule: **a cache is for a read you can afford to be stale on,
that is expensive, that repeats, and for which you can name an invalidation trigger** — if
any of the four is missing, it is a memory leak with a hit-rate dashboard. And at a 40% hit
rate the cache is a *tax* — memory, a network hop, an invalidation protocol, a class of bug
— so the decision should be revisited when the hit rate drops, and a cache with no measured
hit rate is a cache nobody has justified. The final point: every cache is a second source
of truth for its key, and the bar for that should be *higher* than the bar for adding an
index, which is reversible in one statement.

**D34. You are reviewing a schema change that renames a column and adds a foreign key. What
are you checking beyond "does it work"?** `STAFF`

Four categories. **Locking and duration**: does the `ALTER TABLE` take `ACCESS EXCLUSIVE`?
`ADD COLUMN ... DEFAULT` is metadata-only in modern PostgreSQL, but a `NOT NULL` with a
default, a `SET NOT NULL` without the `NOT VALID` trick, and anything that rewrites the
table will block reads and writes for the duration — on 400 million rows that is an outage,
so I want the `lock_timeout` guard and an online-tooling plan if a rewrite is required. A
foreign key added without `NOT VALID` validates the whole table under a lock, and that is
the specific thing to look for. **Reversibility and the three-deploy pattern**: is there a
deploy where old code meets the new schema, where new code tolerates the old state, and
where the old column is dropped only once the new code is everywhere? A single-deploy
migration assumes no rollback, and rollback is what you need to be able to do. **Write
amplification**: the new index the foreign key creates costs WAL on every subsequent write
to a hot table, so what is the write rate and the replica-lag tolerance? **Semantic
equivalence**: does the renamed column mean the same thing in every view, report and
dashboard query? A rename correct in the application and wrong in a materialised view is a
silent reporting bug, and a `CHECK` added to an existing table can fail on rows that are
already there, which is why it must be validated separately. And the process questions: is
there a tested rollback, a rehearsed forward fix, and a run against production-shaped data
with an owner watching?

**D35. You are on call. p99 latency tripled 20 minutes ago and the deploy was 40 minutes ago.
What is your first ten minutes?** `SCENARIO`

In order — and the first thing is *not* to roll back without evidence. **(1) Confirm it is
the deploy**: correlate the onset with the deploy timestamp, and check whether p99 rose
stepwise or gradually, because a gradual rise after a deploy is usually coincidental and
rolling back loses the evidence. **(2) Establish latency versus throughput**: a p99 that
tripled at unchanged throughput is a code regression; a p99 that tripled *because* throughput
tripled is a capacity or queueing problem, and a rollback will not fix it. **(3) Get the
query fingerprint** — `pg_stat_statements` diffed against before, or your APM's before/after
— and look for a query whose `rows` or `mean_exec_time` moved; the single most common cause
is an ORM generating a different query, a missing `select` causing a full row read, or a
lazy load becoming N+1 because a session was closed. **(4) Check the plan for the new query
specifically** — did an index or a statistics change flip it? **(5) Check locks and waits** —
`pg_locks`, `INNODB_TRX`, a long transaction left open by the deploy's own migration.
**(6) Then decide.** If it is clearly the deploy and clearly a code or plan regression, roll
back; reversibility is the entire point of having a rollback. If it is not clearly the
deploy, do not roll back — you are about to make an unrelated change during an incident. The
framing: the goal of the first ten minutes is to narrow the cause to code, data or capacity
and to rule out "nothing", and the rollback is the last step, taken with evidence rather than
instead of gathering it.

**D36. Someone proposes using Elasticsearch as the system of record for a document product.
What do you ask, and what is the answer if the answers are good?** `STAFF`

The questions, in order. **(1) How do you read a document by id?** A `Get` by `_id` is
served by a term lookup on the `_id` field and works, but it is a search engine answering a
key-value question, and the `Get` path is not the contract it is optimised for.
**(2) How do you enforce a unique constraint?** `_id` rejects duplicates on the create API,
but uniqueness on a *business* key requires either making it the `_id` or doing a
search-then-write, which is a race — and Elasticsearch is not transactional, so cross-document
uniqueness is not enforceable. **(3) How do you do a multi-document transaction?** You do
not: you cannot update two documents atomically, you cannot update a document and its
related one together, and you cannot roll back. **(4) What are the update semantics?**
`_update` is a full document read-modify-write; concurrent updates are resolved by
versioning with the later one winning and the earlier getting a conflict, so it is
last-writer-wins, not "merge what I sent". **(5) What does a delete cost?** A tombstone
until merge; the space comes back only when the segment merges. **(6) What happens when a
shard is lost?** With one replica, a node failure plus a replica loss is data that is gone.
If 1 to 3 are "we have not thought about that" — the normal case for this proposal — the
answer is a search index over a source of truth. If the product genuinely has no relational
requirements, single-writer with the document key as `_id` plus a reconciliation sweep is
workable and honest. The framing: the question is not "is Elasticsearch reliable" but "what
guarantee are you giving up that a database gave you for free" — uniqueness, multi-row
transactions, referential integrity, rollback, durability of a partial write — and each one
dropped is a mechanism you now own.

**D37. A read-heavy service needs 40,000 reads per second and 200 writes per second, and must
serve a 40 ms p99. Design the data tier.** `STAFF`

The asymmetry is the design: a 20,000:1 read-to-write ratio means the write path is not the
interesting problem. So: **(1) a relational database as the source of truth**, sized for 200
writes per second, which is a small number for any engine — the concern is not throughput but
whether the p99 is meetable, and 200 writes with a primary and a replica answers that
comfortably. **(2) a cache in front of the read path**, which is where 40,000 reads at 40 ms
actually gets met: Redis, cache-aside or read-through, sized for the working set, with the
hit rate as a first-class metric and an alert on it. The 40 ms target rules out the database
for most of those reads, because a p99 of 40 ms leaves no room for a query that occasionally
takes 200 ms during a checkpoint or an autovacuum. **(3) a replica or read-only endpoint**
for the miss path, so misses do not compete with writes. **(4) staleness as an explicit
contract**: a TTL per data type, a "changed at" the UI can render, and a read-your-writes
path or token where the user must see their own change immediately. The questions I would
ask back: what is the working set size, because that decides whether one Redis node holds it
and therefore whether this is a simple or a clustered deployment; is the read by key or by
query, because by-query caches far less effectively; and what is the fallback when the cache
is unavailable, which is what decides whether the failure behaviour is graceful or a
cascade. The staff closing: this design is not clever, and that is the point — the effort
belongs on the four things that make a cache honest, not on the topology.

**D38. Your company has 40 services, 6 databases and 2 caches, and you are asked to reduce
this to "one data store". What do you say, and what would you actually do?** `STAFF`

I would say the premise is a category error, then do the useful version of the work. The
stores are not redundant — they exist because they have different *shapes* of access, and
the honest diagnosis of a messy data tier is almost never "too many stores" but "stores
whose role was never defined". A cache, a search index, a document store and a source of
truth each holding the same rows for different reasons is not a consolidation problem, it is
a **missing data-ownership map**: nobody can say which store is authoritative for which
field, so consistency is maintained by hope. The work: **(1) inventory** every store, what
it holds, who writes it, who reads it, and how it is populated; **(2) classify by role** —
source of truth, projection, cache, or archive — and the classification is the deliverable,
because most of the low-hanging consolidation is finding things that are *projections
pretending to be sources of truth*; **(3) for each projection, ask whether it can be
rebuilt** — if yes, it is a cache or a read model and should have a TTL and a rebuild path,
and a projection with no rebuild path and no owner is the thing to delete; **(4) identify
genuine consolidation candidates**, which are the unowned or historically-duplicated ones
rather than the load-bearing ones; and **(5) do not consolidate the source of truth with
anything.** The realistic outcome is fewer stores than 48, one clear authority per field, and
a data map that new services are onboarded against — and that artefact is worth more than
the count reduction, because it is what stops the next three services adding three more
stores. The framing: "one store" is a symptom-level goal; the goal-level problem is *unowned
data*, and solving the second makes the first unnecessary.

**D39. A product decision has been made on a store that three of the four architects think
is wrong. What do you do?** `STAFF`

You do not relitigate it — a decision has been made, and relitigating costs credibility and
produces nothing. You do three things. First, make the risk **legible**: not "it is the wrong
tool" but "if we use it, these three things become our problem — uniqueness on a business
key is not enforceable, we cannot update two items atomically, and a schema change becomes a
reindex pipeline". That is a different kind of objection because it is a list of
consequences rather than a preference, and a consequence can be accepted, mitigated, or
rejected on evidence. Second, convert the objection into a **cost the team has explicitly
accepted**, and get the mitigations written down: if uniqueness matters, make the business key
the `_id`; if multi-item consistency matters, put those items in one item or in a store that
can; if reindexing matters, build the pipeline now rather than during the incident. Third,
ask the **decision-relevant question only a staff candidate asks**: what is the reversibility
of this choice, and if it is low, the cost of being wrong is a migration rather than a
feature — so we should spend two extra weeks making it reversible. That framing changes a
room, because it moves the argument from "which technology" to "what are we signing up to",
and it hands the decision-maker a way to say yes *with the risk named*, which is the outcome
actually available. The professional discipline: you are owed a written list of what the
choice gives up, delivered without a recommendation — and if the team accepts it, you then
help build the mitigations, because a decision nobody owned is how incidents happen.

**D40. You are two years from leaving and the company has one database. What do you build
so the data tier is not a liability when you go?** `STAFF`

Four things, in this order, and they are cheap while everything works. **(1) A data map
naming, for every store, what it is for** — source of truth, projection, cache, or archive,
with the rebuild path for anything that is a projection. This is the artefact whose absence
causes every data incident, and its presence turns onboarding a new service into two hours
instead of two weeks of archaeology. **(2) A restore procedure that has been run.** A backup
that has never been restored is a hypothesis. This is the most common failure in a company
that has never had a disaster: the backup exists, retention is set, and the first restore
attempt reveals wrong credentials, the wrong region, or an eleven-hour dump. **(3) A named
owner and a defined staleness contract for every store**, so "who do I ask why this is nine
minutes old" has an answer, and a store nobody uses can be deleted rather than defended.
**(4) The irreversible decisions recorded where the next person will find them** — shard
keys, partition keys, the `_id` scheme, storage classes with their minimum durations, the
Elasticsearch mapping — each with its *reason* and its *date*, because the reason is what
lets someone tell whether it still holds. The reasoning behind all four is the same: the
value of an architecture decision decays, and what survives is not the technology but the
*evidence* that it was right at the time. Which is also the answer to "what is the senior
skill": the decisions are never about the technology, they are about which number will matter
for your workload — and the professional habit is to write down which one, and why, before
you forget.

**D41. A team wants to move 2 TB of data from one database engine to another over a
weekend. What is your plan, and what would make you refuse?** `STAFF`

The plan is dual-write with verification, not a migration tool. (1) Establish whether it is
even necessary, because "the new engine is nicer" is a preference and a legacy-engine
constraint is a reason, and one of them justifies a weekend and the other justifies a
quarter. (2) Define the mapping explicitly, including types, nullability, defaults,
collation, time zones, sequences and the primary keys, because a silent semantic difference
in a `TIMESTAMP` or a `VARCHAR` collation is the class of bug that appears a month later as
a report discrepancy. (3) Backfill in batches with a keyset cursor, not `OFFSET`, and
verify continuously — row counts, checksums on a sample, and a reconciliation report per
table. (4) Switch reads to the new store, with the old one still writable, so the switch is
a configuration change and can be reversed in seconds. (5) Only then stop writing the old
one, and only then decommission it, after a full business cycle in which nothing read from
it. (6) Have the rollback rehearsed, not just planned. What would make me refuse: no
reconciliation, a single cutover with no dual-write period, no rollback, a schema difference
that is silently coercible rather than rejected, or a migration that must run inside a
business-critical window. The staff framing: the weekend is not the risk — the *cutover*
is, and the design that de-risks it is the two-store period everyone wants to skip.

**D42. Your database's p99 is 400 ms and the team blames the database. How do you find out
whether they are right?** `STAFF`

You do not start with the database, and that is the point of the question. First establish
whether the 400 ms is *in* the database or *waiting* for it: the APM trace will show
queueing, connection-pool acquisition and serialised downstream calls, and a "slow
database" that is really an N+1 in an ORM is the most common version of this. Second, get
the query fingerprint and separate three populations — a few slow queries, a few slow
*plans*, and a fast query that is slow because of lock waits or resource contention; they
have completely different causes. Third, check the four that masquerade as "the database":
lock waits and a long transaction holding them, a plan that changed after a statistics
update or a new release, a replica or storage latency change rather than a query change,
and resource exhaustion (connections, memory, I/O) which makes everything proportionally
slower. Fourth, check whether it was *always* 400 ms — a p99 that has been constant for a
year is an unexamined design decision, not a regression, and the fix is an architectural
one rather than a tuning one. And the answer to "are they right": sometimes, and the useful
reply is to agree loudly and redirect the effort to the specific layer, because a team that
believes the database is the problem will keep optimising the wrong thing. The staff
framing: the interesting work is the part of the latency that is not the database, and
splitting that out is the skill.

**D43. Everything is fine until it is not. What do you want in place *before* the bad
day?** `STAFF`

Four things, and none of them is a bigger cluster. **(1) A restore you have actually
performed.** Not configured — performed, on production-shaped data, to a known duration, by
someone who is not the person who set it up. A backup that has never been restored is a
hypothesis, and the first restore attempt routinely reveals wrong credentials, a full
disk on the restore host, or a dump that takes eleven hours. **(2) Know your recovery point
and recovery time, and be honest about which is which** — because a replica is a fast
failover with a small data loss and a nightly dump is a slow recovery with a day's loss, and
teams that say "we have replication" are usually describing the first while assuming the
second. **(3) Have the irreversibles written down with their reasons** — shard keys,
partition keys, the `_id` scheme, storage classes with their minimum durations, the
Elasticsearch mapping — so the next person can tell whether a decision made two years ago
still holds under today's numbers, and so nobody "fixes" a constraint they do not
understand. **(4) Have the failure inventory written down**: the five ways this system
plausibly breaks, what each looks like, and what the first diagnostic is, so that at 3am
someone reads a list rather than improvises. Plus the two operational ones: alert on the
*symptoms users feel* — error rate and latency, not disk space — and make the
runbook's first step a reversible action. The reason this is a design question rather than
an ops one: everything on this list is cheap while the system is working and impossible
under time pressure, so the discipline is deciding now, in advance, which number you are
willing to lose.

---

## Chapter 11 — End of the Set — Where to Go Next

The eleven volumes are not eleven subjects. They are one argument told eleven times: that a
database is a set of decisions about where data lives, who is allowed to see which version
of it, and what happens when the assumption underneath those decisions stops being true.
Volume 1 makes the claim from the physical layer up. Volumes 2 and 3 give you the language
the rest of the set is written in. Volumes 4, 5 and 6 are the three ways that language
stops matching reality — the plan that ignores your index, the isolation level that does not
say what you thought, the partition key that cannot be changed. Volumes 7 through 11 then
take the same argument into eight specific engines, and the differences between those
engines stop looking like feature lists and start looking like different answers to the same
three questions.

That is the through-line worth carrying out of here: **the interesting part of any database
decision is the failure mode you are choosing.** MySQL's clustered index makes secondary
lookups expensive, and that is also why a secondary index there is a covering index more
often than you would write in PostgreSQL. Redis's single-threaded command loop is why
`SCAN` is O(n) and why the whole eviction story is a memory-budget argument rather than a
performance one. Cassandra's write path is fast because it never has to pick the one true
order, and it pays for that on every read with a reconciliation you now own. None of these
are bugs to be fixed later; they are the price of the thing you wanted.

**If you are preparing for a backend engineering interview**, the load-bearing path is
Volumes 1, 2, 3, 4 and 5. That is SQL as a language, indexes, and transactions — the
material that appears in almost every backend loop and the only part of this set where
being wrong is immediately visible. Read Volume 6 for the scaling questions, Volume 7 or
Volume 8 for whichever engine the role actually uses, and Volume 11's bank for the
predict-the-output section. Everything else is depth you can defer.

**If you are preparing for a data-platform or infrastructure interview**, reverse the
order. Start with Volume 10, because the partition-key and consistency-level questions are
the ones that actually get asked, then Volume 9 for the caching and failure-mode
vocabulary, then Volume 11's S3 and Elasticsearch chapters. Volumes 4 and 6 are the ones
you will be expected to *share* a vocabulary with rather than to have memorised.

**If you are preparing for a staff interview**, the differentiator is not breadth across
these eleven volumes — it is being able to state, for a system you have actually run, which
of these decisions was expensive and which was cheap, and why. The volumes are structured to
push you toward that: the `When NOT to Use` and `Scaling & Failure Modes` slots exist
because "when would you not choose this" is the question that separates a candidate who
has configured a store from one who has operated it. Read the volumes for your two
strongest engines closely and skim the rest, and be ready to defend the trade you made.

### Primary Sources

The habit this set is trying to build is reading the engine's own documentation and then
its source, rather than a blog post about the engine. Five sources carry most of the
weight, and they are worth reading directly:

- **The PostgreSQL manual** — the chapters on storage, transaction isolation and
  multiversion concurrency are more precise than anything written about them since, and
  they are the only place the `xmin`/`xmax` visibility rule is stated without a
  simplifying assumption. `postgresql.org/docs/current` is the current version; the
  internals chapters in Volume 7 map onto it section by section.
- **The InnoDB documentation, not the MySQL manual** — the clustered-index behaviour,
  next-key locking and purge are InnoDB's behaviour, and most MySQL material describes a
  different storage engine that happens to ship in the same binary. `dev.mysql.com/doc`
  under *InnoDB* is the section that matters.
- **The Redis documentation's command pages** — every complexity claim in Volume 9 should
  be checked against the command's own page, because the interesting cases are the
  `SCAN` family and the blocking variants where the headline "O(1)" quietly does not
  apply.
- **DynamoDB's documentation on the data model, before the SDK** — the key schema and
  capacity model documentation explains the constraints that will otherwise surface as an
  HTTP 400 in production, and it is written for someone designing a table rather than
  calling one.
- **The Cassandra documentation's data-modelling section** — the denormalisation-first
  rule only makes sense once you have read why the `WHERE` clause of your query is a table
  design constraint, and that argument is made in Cassandra's own docs more clearly than
  it can be made in the abstract.

Beyond those, the pattern that generalises: when a claim in this set surprises you, the
answer is almost never in a tutorial. It is in the engine's source, in its issue tracker,
or in a `Release Notes` entry from the version that changed the behaviour. The engineers
who are genuinely strong at this are not the ones who have memorised the most — they are
the ones who have a reliable route from a surprising `EXPLAIN` to the code that produced
it, and that route is the thing to build next.
