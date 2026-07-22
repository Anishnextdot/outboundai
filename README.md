# Arka Outbound Agent — MVP

An AI-native outbound marketing engine for Arka Alliance. This is **Phase 1, vertical slice**: it takes one lead all the way through the pipeline so we can prove the whole flow before scaling each stage.

```
ICP  →  Lead Discovery  →  Decision Maker  →  Research  →  Personalization  →  Email Draft  →  Human Approval
```

Humans do three things: **approve content, give strategy feedback, make campaign calls.** Agents do the rest.

## What's built

| # | Agent | File | Data source |
|---|-------|------|-------------|
| 1 | Lead Discovery | `src/agents/leadDiscovery.ts` | Apollo org search |
| 2 | Decision Maker Finder | `src/agents/decisionMaker.ts` | Apollo people search + title/authority scoring |
| 3 | Company Research | `src/agents/research.ts` | Claude (+ optional web search) → structured dossier |
| 4 | Personalization | `src/agents/personalization.ts` | Claude → research-grounded angles |
| 5 | Content | `src/agents/content.ts` | Claude → cold email in Sujatro's voice |
| 6 | Human Approval | `app/dashboard` + `app/api/campaigns` | You |

Orchestration is a **LangGraph.js** state graph (`src/agents/graph.ts`) with a blocking gate. Persistence is **Supabase** (`src/lib/repository.ts`) — the sole system of record.

## Trust & blocking (Phase 1)

Every campaign carries a **trust score** — four equal-weighted 0-100 signals (company data, decision-maker, verified email, research grounding), stored and shown in the dashboard. A campaign is **BLOCKED** — and generates no outreach — if the company, decision-maker, or a verified email is missing. Approval is gated server-side: you cannot approve a blocked campaign or one below `TRUST_THRESHOLD` (default 70).

`APP_MODE=production` forbids fabricated data entirely (missing data → BLOCKED). `APP_MODE=demo` (default) allows clearly-labelled mock data.

## Stack

- **Next.js 15** (App Router) — approval dashboard + API
- **TypeScript** — agents + orchestration
- **LangGraph.js** — multi-agent pipeline with a conditional block gate
- **Supabase** — durable persistence (companies / contacts / research / campaigns / emails / responses)
- **Claude (Opus 4.8)** via `@anthropic-ai/sdk` — research, personalization, drafting
- **Apollo.io** — company + decision-maker data + verified email reveal

## Run it

```bash
npm install
cp .env.example .env.local          # configure Supabase (+ Apollo/Claude)
# apply the schema: `supabase db push` OR paste supabase/migrations/0001_init.sql
npm run dev                         # → http://localhost:3000/dashboard
```

**Supabase is required** — there is no in-memory fallback; the API fails loudly (500) until it's configured. Apollo/Claude keys are optional in `demo` mode (stages fall back to labelled mock data); in `production` they're required or the lead BLOCKS.

### CLI + verification (no browser, no DB)

```bash
npm run pipeline -- "Sports brands" "11-200" "India"   # run the pipeline, print trust/blocked
npm run verify                                          # trust + gate + blocking checks
npm run db:check                                        # Supabase smoke test (needs creds)
```

### Typecheck / build

```bash
npm run typecheck
npm run build
```

## How the approval loop works

1. Enter an ICP on the dashboard and **Run pipeline**.
2. A campaign card appears with the trust breakdown, source, status, the scored decision-maker, the research dossier, the outreach angles, and (if not blocked) an editable email draft.
3. **Approve** (only when non-blocked and trust ≥ threshold), **Reject**, or edit the email inline and **Save edits**. Nothing is sent — approval is the gate. Blocked campaigns show a reason and produce no draft.

## The writing bar (Agent 5)

Every email passes through Sujatro's principles (`SUJATRO_STYLE` in `src/agents/content.ts`): research-first, direct, short, no jargon, no AI-sounding phrasing, one soft ask. This is the guardrail behind success criteria #3 and #6 — "doesn't sound AI-generated" and "reads like a senior consultant wrote it."

## Deliberately NOT built yet (later phases)

Real email sending (SMTP — Agent 7), reply tracking (Agent 8), LinkedIn automation, the learning/analytics agent, multi-lead batching, auth on the dashboard/API, CRM integrations.

## Next steps

- Turn on `ENABLE_WEB_SEARCH=true` to ground research (raises the researchGrounding trust component to 100).
- Widen Lead Discovery from one company to a batch (raise `per_page`, loop the graph) — needs a job queue, not request-time execution.
- Add **auth** to the dashboard/API before any real prospect data flows.
- Add **Agent 7 (Outreach)**: SMTP send for approved drafts + reply tracking (Phase 3).
