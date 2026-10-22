#!/usr/bin/env bash
# runs jig on Terminal-Bench 2.0 through Harbor, the official harness
# usage: evals/tbench/run.sh [extra harbor flags], e.g. -k 3 or -i fix-git
# needs: docker, harbor (uv tool install harbor), OPENROUTER_API_KEY in .env
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -n "${JIG_BINARY:-}" ] || bun run build # JIG_BINARY: test a prebuilt variant instead
set -a; source .env; set +a # OPENROUTER_API_KEY for the adapter

# the first 10: the 4 easy tasks and the 6 quickest medium ones
tasks=(cobol-modernization fix-git overfull-hbox prove-plus-comm crack-7z-hash
  raman-fitting constraints-scheduling kv-store-grpc pytorch-model-recovery
  break-filter-js-from-html)

PYTHONPATH=evals/tbench harbor run \
  -d terminal-bench@2.0 \
  --agent-import-path jig_agent:JigAgent \
  -m "${JIG_MODEL:-anthropic/claude-haiku-5.5}" \
  --allow-agent-host openrouter.ai \
  -o evals/tbench/jobs \
  -n 4 \
  -y \
  $(printf -- '-i %s ' "${tasks[@]}") \
  "$@"
