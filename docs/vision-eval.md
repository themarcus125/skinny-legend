# Vision model evaluation (SKI-41)

The app's only piece of judgement is `classifyPhoto` in
`apps/api/src/services/vision.ts`: it sends a member's photo to an OpenRouter vision model
and gets back `{ categories, healthy, confidence, reason }`. The model id is the
`VISION_MODEL` environment variable, so swapping models is a config change, not a deploy.

This harness is how we decide which model that should be. It runs the *real*
`classifyPhoto` over a set of labelled photos, once per candidate model, and prints a
comparison table.

Everything lives in `apps/api/scripts/vision-eval/`:

| Path | What it is |
|---|---|
| `fixtures/manifest.json` | The labels: 20 rows of `{ file, expected: { categories, healthy }, note }` |
| `fixtures/README.md` | How to shoot and name the photos |
| `fixtures/*.jpg` | Your photos. Git-ignored, never committed |
| `models.json` | Candidate model ids and the fallback $/M-token price table. Edit this |
| `run.ts` | The CLI |
| `scoring.ts` | Pure scoring/aggregation, unit-tested in `apps/api/test/vision-eval.test.ts` |
| `results/*.json` | One file per run. Git-ignored |

---

## 1. Build the fixture set

**Nothing runs until you add photos.** The repo ships the labels and not the images, both
because they are personal and because a stock-photo fixture set would flatter every model.

Read `apps/api/scripts/vision-eval/fixtures/README.md` for the full guidance; the short
version:

- Take the 20 photos **on your phone**, the way a member actually would: hand-held, indoor
  lighting, cluttered table, slightly tilted. That is the distribution the model will meet
  in production.
- Name each file exactly as the `file` field in `manifest.json` says, and save as JPEG
  (`classifyPhoto` sends the bytes as `data:image/jpeg;base64,...`, so the extension has to
  be honest). Resize to about 1024px on the long edge — the image is base64'd into every
  request, so full-resolution originals cost real money on every model you test.
- The set is deliberately built around the rulebook in
  `docs/superpowers/specs/2026-09-11-skinny-legend-design.md` §2: 5 exercise (including a
  Strava screenshot, which has no human in frame at all), 6 meals split 3 healthy / 3 not
  (including bubble tea, which is a drink rather than a plate), 4 group photos (including a
  video call, and one meal-plus-group that has no exercise in it), 3 unrelated, and 2
  genuinely ambiguous.

### What makes a good negative

The three `unrelated-*` rows carry most of the signal. A model that answers `exercise` to
everything scores beautifully on the exercise photos and is unusable in production, because
then every selfie a member uploads is worth +3 points.

So a good negative is **plausible**, not obviously off-topic: an ordinary indoor selfie, a
park path that could pass for a run, a person sitting at a table doing nothing. The single
biggest driver of false `exercise` and false `group` tags is simply *a human being in the
frame* — build negatives that test exactly that, not photos of spreadsheets.

The two `ambiguous-*` rows are different: the label there is **our ruling**, not an obvious
truth (a protein shake counts as a healthy meal; a plate of food photographed at the gym is
a meal and not also a workout). When a model misses those, read its `reason` before
blaming it. If its argument is better than ours, change the label in `manifest.json` and
say so in the commit message.

You do not need all 20 to start. Missing files are skipped with a warning and the report
records how many actually ran.

---

## 2. Run it

The harness makes **real, paid** OpenRouter calls — roughly 20 photos × 3 models per run.
At current candidate pricing that is small change, but it is not free.

```bash
# See what would run, without a key and without calling anything:
pnpm --filter @skinny/api vision:eval --dry-run

# The real thing:
OPENROUTER_API_KEY=sk-or-... pnpm --filter @skinny/api vision:eval
```

The key may also live in the repo-root `.env`; the shell always wins over the file. With no
key the script prints how to get one and exits `1`.

| Flag | Default | Notes |
|---|---|---|
| `--models a,b,c` | every id in `models.json` | Ids not in `models.json` run fine but have no pricing |
| `--locale vi\|en` | `vi` | Only switches the language of the model's `reason` sentence, exactly as production does |
| `--concurrency N` | `2` | Requests in flight per model. Raise it carefully; OpenRouter rate-limits |
| `--timeout-ms N` | `20000` | Production uses 8000. Run once at 20000 to see true latency, then once at 8000 to see how many calls the production budget would actually drop |
| `--timestamp S` | now, ISO 8601 | Names `results/<timestamp>.json` |
| `--dry-run` | off | Lists models and fixtures, calls nothing, needs no key |

### The candidate models are unverified

`models.json` ships three ids:

```
qwen/qwen3.7-flash            <- the current VISION_MODEL default (cheapest: $0.03/M in)
z-ai/glm-4.6v
z-ai/glm-5.3-flash
google/gemini-3.1-flash-lite  <- non-Chinese control
```

**Check all three against <https://openrouter.ai/models> before the first paid run**, and
confirm the `$/M` figures there too. OpenRouter ids and prices change. A wrong id is not an
error you will notice in the table — it returns HTTP 404, which the harness records as a
100% failure rate for that model, which looks exactly like a model that is simply bad.

---

## 3. Read the table

```
| Model | Fixtures | Exact match | Exercise P/R | Meal P/R | Group P/R | Healthy acc | Fail rate | Mean latency | p95 | $/photo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `qwen/qwen3.7-flash` | 20 | 75% | 100% / 92% | 90% / 100% | 80% / 75% | 83% | 5% | 1420 ms | 2900 ms | $0.00021 |
```

- **Exact match** — the fraction of photos where the predicted category *set* equals the
  expected set, order- and duplicate-insensitive. Getting `[exercise]` on a
  `[exercise, group]` photo is not a partial credit here; it is a miss.
- **P/R per category** — precision then recall. *Precision* is what protects the game:
  low precision means the model hands out points for photos that should score nothing, and
  members notice that faster than anything else. *Recall* costs a member a tap: the chips
  in the verdict sheet are editable, so a missed category is an annoyance, not a wrong
  score. **When two models are close, take the one with better precision on
  `exercise`.** `-` means the metric is undefined (no such prediction, or no such fixture).
- **Healthy acc** — the healthy flag, scored only over the photos whose ground truth
  includes `meal`. If the model does not spot the meal at all, `healthy` comes back `null`
  and counts as wrong, which is the behaviour we want to punish.
- **Fail rate** — timeouts, HTTP errors and unparseable JSON. In production these become an
  entry with no categories and `verdict.failed = true`, so the member picks by hand. A
  model with great accuracy and a 15% fail rate is worse than the table's accuracy column
  makes it look. Failed calls also count as misses in the accuracy and recall columns.
- **Mean latency / p95** — wall clock per call, from the same code path production uses.
  Production times out at 8000 ms; anything with a p95 near that will drop calls under
  load.
- **$/photo** — from OpenRouter's own `usage.cost` when the provider reports it (the
  harness opts every request into usage accounting). A trailing `*` means the number was
  estimated from the `$/M` table in `models.json` instead — an order of magnitude, not a
  bill.

### Then read the miss table

The summary table cannot tell you *why* a model is wrong; the per-model miss list under it
can. It shows every photo where the category set was wrong, the healthy flag was wrong, or
the call failed, along with the model's own `reason` sentence.

Two traps worth knowing:

- A failed call on an `unrelated-*` photo "matches" its empty ground truth by accident, so
  it does **not** cost exact-match accuracy. That is why failures are always listed in the
  miss table, and why you read the fail-rate column separately.
- A photo can be an exact category match and still be a miss on the healthy flag. Those
  rows appear in the miss table too.

The full detail — every verdict, reason, confidence, latency and token count — is in
`apps/api/scripts/vision-eval/results/<timestamp>.json`. Results are git-ignored; paste the
markdown table into the SKI-41 issue rather than committing the file.

### What "good enough" looks like

There is no automatic pass/fail. The shape of a shippable model:

1. Fail rate under ~5% at `--timeout-ms 8000`.
2. Precision on `exercise` at or near 100% — no free points for selfies.
3. Healthy accuracy comfortably above chance on the six meal photos. Members can override,
   so this matters less than the category calls.
4. Cost per photo well under $0.001, per the spec's budget.

Recall and the two `ambiguous-*` rows are tie-breakers, not gates.

---

## 4. Switch the model on Railway

`VISION_MODEL` is read at boot in `apps/api/src/env.ts` (default `qwen/qwen3.7-flash`).
Nothing else in the app hard-codes a model id, so changing it is a variable change plus a
restart — no code change and no rebuild.

Railway dashboard: open the API service → **Variables** → set

```
VISION_MODEL = <the winning model id, exactly as on openrouter.ai/models>
```

then redeploy the service so the new process picks it up.

Or with the CLI:

```bash
railway variables --set VISION_MODEL=z-ai/glm-4.6v
railway redeploy
```

Afterwards:

- Confirm the id took effect by uploading one photo and checking that `ai_verdicts.model`
  on the new row is the model you set — that column records the id per verdict, so it is
  also the audit trail if you ever need to know which model judged a given entry.
- Watch the failure rate for a day. A model that looked fine on 20 fixtures can behave
  differently on real traffic, and the rollback is the same one-variable change.
- Update the default in `apps/api/src/env.ts` and `.env.example` only once the new model has
  been live for a while — until then, keeping the code default and the deployed value
  distinct is what makes the rollback trivial.

---

## 5. Tests

The scoring and aggregation logic is unit-tested with no network access:

```bash
pnpm --filter @skinny/api exec vitest run test/vision-eval.test.ts
```

Those tests cover the manifest and models-file parsers, the category set comparison, usage
extraction and cost estimation, the per-category precision/recall maths, the markdown
rendering, and one end-to-end pass through the real `classifyPhoto` with an injected fake
`fetch`. `run.ts` itself — argument parsing and file I/O — is not unit-tested; use
`--dry-run` to smoke it.
