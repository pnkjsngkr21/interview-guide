# Spring interview-prep — Inventory

**Date:** 2026-10-03
**Scope:** `interview-prep/spring/*.html` (11 volumes) and `interview-prep/cheatsheets/spring/*.html` (11 cheatsheets)
**Baseline:** all 22 pages PASS `check.js` with zero errors, on both `--volume` and `--cheatsheet`. Warnings are advisory and part of the established baseline.

## Corpus at a glance

| Metric | Count |
| --- | --- |
| Volumes | 11 |
| Cheatsheets | 11 (1:1 mapping, no orphans either direction) |
| Interview Q&A articles | 1,084 |
| Callouts | 388 |
| ASCII diagrams | 198 |
| Tables | 217 |
| Number cards (cheatsheets only) | 144 |
| `docs.spring.io` citations | 172 |

This is a **mature, senior-level corpus**. The gap work is freshness and coverage, not remediation of basics.

## Per-file depth

| # | Volume | Chapters | Q&A | Depth | Cheatsheet sync |
| --- | --- | --- | --- | --- | --- |
| 1 | Spring Core & the IoC Container | 8 | 78 | deep | full; no scenario-bank triage table (v2 has one) |
| 2 | Bean Lifecycle, Scopes & Advanced DI | 8 | 105 | deep | full; §3.5 thread safety and §7.8 JPA cycle case missing |
| 3 | AOP & Proxying | 8 | 89 | deep | pending re-inventory |
| 4 | Transaction Management | 8 | 113 | deep | pending re-inventory |
| 5 | Spring MVC & the Web Layer | 8 | 91 | deep; §7.5 outbound calls omits `RestClient` | full; `RestClient` absent |
| 6 | Spring Data JPA & Persistence | 8 | 122 | deep; Spring cache abstraction never taught | full; `CacheManager` absent |
| 7 | Spring Boot & Auto-Configuration | 8 | 108 | deep; virtual threads reduced to one table row | full; missing 3.5 starter build, 1.5 scan-root trap, 2.5 condition report |
| 8 | Spring Security | 8 | 97 | deep | full; missing attack-surface table, `AuthorizationManager`, auth-server split, `kid`, session fixation, `@WebMvcTest` |
| 9 | Testing, Production & Troubleshooting | 8 | 102 | deep | full |
| 10 | WebFlux & Project Reactor | 9 | 65 | deep | full |
| 11 | Spring Cloud & Distributed Systems | 9 | 114 | deep; §5.4 OTel is one diagram + one paragraph | **chapters 1, 7 and 8 have no cheatsheet section at all** |

Every volume chapter carries the consistent triple: `Common Mistakes` -> `Interview Questions — <topic>` -> `Further Reading`. Cheatsheets deliberately carry **zero** Q&A (verified `class="qa"` = 0 across all 11); they substitute `callout--trap` labels phrased as the interview question. That is the house convention, not a gap.

## Style conventions observed (must be preserved)

- Volumes: `pre.snippet` **with** `data-lang`; `pre.diagram` **without** `data-lang` (198 diagrams, 0 violations — the invariant CLAUDE.md documents).
- Cheatsheets: `pre.snippet` **with** `data-lang` + `data-title` + `data-hl-line`; diagrams are inline hand-authored SVG, not `pre.diagram`.
- Callout vocabulary is a closed set of 7: `must` (80), `prod` (84), `scale` (35), `staff` (43), `summary` (80), `tradeoff` (27), `trap` (39). Labels: "Must remember", "In production", "Scaling reality check", "Staff-level", "Chapter summary", "Trade-off", "Interview trap".
- `.number` cards are cheatsheet-only.
- LF endings, no emoji outside `pre` — both clean across all 22 files.

## Version-specific claims — audit result

The corpus already tags versions **inline at the point of claim**, which is good practice and largely correct. Spot-verified against official sources:

| Claim | Verdict |
| --- | --- |
| `@MockBean`/`@SpyBean` deprecated in Boot 3.4 for `@MockitoBean`/`@MockitoSpyBean` (Spring Framework 6.2) | **correct** (Boot 3.4 release notes) |
| `WebSecurityConfigurerAdapter` removed in Security 6.0; `authorizeRequests()` removed in 6.1 | **correct** — the distinction is usually gotten wrong; the file gets it right |
| `SecurityContextPersistenceFilter` replaced by `SecurityContextHolderFilter` in Security 5.7 | **correct** |
| `JwtValidators.createDefaultWithIssuer` checks `iss`/`exp`/`nbf`, never `aud` | **correct** |
| Boot 2.7 introduced `AutoConfiguration.imports`; Boot 3.0 removed `spring.factories` auto-config | **correct** |
| Boot 2.3 stopped shipping Hibernate Validator via `starter-web` | **correct** |
| Boot 2.6 rejects circular references by default | **correct** |
| `@MockBean` rhetorical use at `spring-01:51` | **stale** — deprecated in Boot 3.4 |
| Resilience4j `waitDurationInOpenState` shown as `10s` in cheat11 "Numbers worth memorising" | **WRONG** — official default is **60000 ms (60s)**; the cheat reads as a default when it is a tuning choice |