# Benchmarks

Model: `anthropic/claude-haiku-5.5` via OpenRouter. Oldest first.

## 1. Stream stall timeout and retries (local eval, 11 tasks × 3 tries)

jig hung forever when the model stream stalled. Fix: abort after 90s without data, retry up to 2 times; bash commands time out after 120s.

|        | Before (9ba067c) | After (42b07b8) |
| ------ | ---------------- | --------------- |
| pass^3 | 91%              | **100%**        |
| hangs  | 5                | **0**           |

## 2. First Terminal-Bench run (2.0, 10-task subset, 1 try, 04ab7d7)

**4/10**, 591k tokens. Subset: the 4 easy tasks + 6 quickest medium ones, listed in `evals/tbench/run.sh`. Not a full Terminal-Bench score.

Failures: asked the user a question and stopped, misread the spec, claimed success without checking.

## 3. Headless prompt section (same subset, 1 try)

With `-p`, the system prompt tells the model nobody can answer, to keep going until done, and to verify every requirement before finishing.

|                       | Before (04ab7d7) | After (9c386f4) |
| --------------------- | ---------------- | --------------- |
| Terminal-Bench subset | 4/10             | **8/10**        |
| tokens                | 591k             | 833k            |

Local eval stayed 33/33 (+20% tokens). One try per task, so confirm with `-k 3` before quoting.

## 4. Prompt caching (OpenRouter automatic cache point)

Each request marks its unchanged start as cacheable: later reads cost 0.1×, the first write 1.25×. Cost is now OpenRouter's billed amount.

|                                           | Cache off | Cache on   |
| ----------------------------------------- | --------- | ---------- |
| Terminal-Bench subset: cost               | $0.116    | **$0.057** |
| Terminal-Bench subset: cost per 1M tokens | $0.136    | **$0.071** |
| Terminal-Bench subset: cache hit rate     | 0%        | 87%        |
| local eval (4 tasks × 3): cost            | $0.064    | **$0.029** |
| local eval: cost per 1M tokens            | $0.138    | **$0.084** |

About half the cost per token, with no loss in pass rate (Terminal-Bench 7/10 and 9/10, local 12/12 both; the pass difference is run-to-run noise, not caching).
