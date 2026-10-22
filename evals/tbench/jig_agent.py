"""Harbor adapter: runs jig on Terminal-Bench 2.0 tasks.

Each task runs in its own throwaway Docker container. install() copies the
self-contained jig binary (bun run build -> dist/jig) into it; run() calls jig
headless with the task's instruction. See evals/tbench/run.sh.
"""

import json
import os
import shlex
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

# JIG_BINARY points at another build, e.g. to compare two prompt variants
JIG_BINARY = Path(
    os.environ.get("JIG_BINARY")
    or Path(__file__).resolve().parents[2] / "dist" / "jig"
)
REMOTE_JIG = "/installed-agent/jig"

# long tasks need more room than jig's interactive defaults (20 steps, 200k tokens)
MAX_ITERATIONS = 100
MAX_TOKENS = 3_000_000


class JigAgent(BaseInstalledAgent):
    @staticmethod
    def name() -> str:
        return "jig"

    async def install(self, environment: BaseEnvironment) -> None:
        if not JIG_BINARY.exists():
            raise FileNotFoundError(f"{JIG_BINARY} missing: run `bun run build`")
        await environment.upload_file(JIG_BINARY, REMOTE_JIG)
        await self.exec_as_root(environment, command=f"chmod 755 {REMOTE_JIG}")

    @with_prompt_template
    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        logs = self.environment_logs_dir
        model = f"--model {shlex.quote(self.model_name)} " if self.model_name else ""
        # the container is the sandbox, so jig approves everything inside it.
        # jig's own .jig/ folder is removed afterwards so tests only see the work.
        # exit 0 regardless: the verifier decides pass/fail, jig's output is in the logs
        command = (
            f"mkdir -p {logs} && "
            f"{REMOTE_JIG} -p {shlex.quote(instruction)} --json "
            f"--dangerously-skip-permissions {model}"
            f"--max-iterations {MAX_ITERATIONS} --max-tokens {MAX_TOKENS} "
            f"> {logs}/jig.json 2> {logs}/jig.log < /dev/null; "
            f"rm -rf .jig; exit 0"
        )
        await self.exec_as_agent(
            environment,
            command=command,
            env={"OPENROUTER_API_KEY": os.environ["OPENROUTER_API_KEY"]},
        )

    def populate_context_post_run(self, context: AgentContext) -> None:
        output = self.logs_dir / "jig.json"
        if not output.exists():
            return
        try:
            result = json.loads(output.read_text().strip().splitlines()[-1])
        except (json.JSONDecodeError, IndexError):
            return
        # jig reports one total (budgetUsed: includes sub-agents), not an input/output split
        context.n_input_tokens = result.get("budgetUsed")
        context.metadata = {
            "stop_reason": result.get("stopReason"),
            "iterations": result.get("iterations"),
            "tool_calls": len(result.get("tools", [])),
        }
