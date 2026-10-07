import { useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import type { Item } from "./types";
import type { SystemMessage } from "../provider";
import { completeStream } from "../provider";
import { runLoop } from "../loop/loop";
import type { LoopState } from "../loop/types";
import type { Session } from "../session";
import { summarizeArgs } from "./summarize";
import { ItemView } from "./ItemView";

const session: Session = {
  permissions: {
    allowList: [],
    projectRoot: process.cwd(),
  },
};

type Props = { systemPrompt: SystemMessage };
type LiveTool = { name: string; summary: string };

let nextId = 1;

export function App({ systemPrompt }: Props) {
  const { exit } = useApp();
  const [items, setItems] = useState<Item[]>([{ id: 0, kind: "banner" }]); // static items
  const [input, setInput] = useState("");
  const [liveText, setLiveText] = useState("");
  const [liveReasoning, setLiveReasoning] = useState("");
  const [liveTool, setLiveTool] = useState<LiveTool | null>(null);
  const [running, setRunning] = useState(false);
  const loopState = useRef<LoopState | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef("");

  function push(kind: "user" | "assistant" | "error", text: string) {
    const id = nextId++;
    setItems((prev) => [...prev, { id, kind, text }]);
  }

  function pushTool(name: string, summary: string, ok: boolean) {
    const id = nextId++;
    setItems((prev) => [...prev, { id, kind: "tool", name, summary, ok }]);
  }

  function flushText() {
    const text = liveRef.current.trim();
    liveRef.current = "";
    setLiveText("");
    if (text) push("assistant", text);
  }

  async function submit(text: string) {
    // submits the user query to runLoop
    const controller = new AbortController();
    abortRef.current = controller;
    push("user", text);
    setInput("");
    liveRef.current = "";
    setLiveText("");
    setLiveReasoning("");
    setRunning(true);

    try {
      const result = await runLoop({
        messages: [{ type: "user", content: text }],
        state: loopState.current,
        complete: completeStream,
        config: {
          maxIterations: 20,
          maxTokens: 200000,
          contextWindow: 128000,
          systemPrompt,
          maxPruneAllowanceRatio: 0.1,
          compactionRatio: 0.9,
          pruneRatio: 0.5,
          loopModel: "openai/gpt-oss-120b",
          compactionModel: "openrouter/free",
          transcriptCapChars: 2000,
        },
        ctx: {
          session,
          asker: async () => "allow-once",
          signal: controller.signal,
          maxOutputChars: 2000,
        },
        events: {
          onText: (c) => {
            liveRef.current += c;
            setLiveText(liveRef.current);
          },
          onReasoning: (c) => setLiveReasoning((p) => p + c),
          onToolStart: (call) => {
            flushText();
            setLiveReasoning("");
            setLiveTool({
              name: call.name,
              summary: summarizeArgs(call.arguments),
            });
          },
          onToolResult: (call, result) => {
            setLiveTool(null);
            pushTool(
              call.name,
              summarizeArgs(call.arguments),
              !/^(Error|Not allowed)/.test(result),
            );
          },
        },
      });

      loopState.current = result.state;

      flushText(); // final answer

      if (result.stopReason !== "stop") {
        push("error", `stopped: ${result.stopReason}`);
      }
    } catch (e) {
      push("error", e instanceof Error ? e.message : String(e));
    } finally {
      setLiveText("");
      setLiveReasoning("");
      setLiveTool(null);
      setRunning(false);
      abortRef.current = null;
    }
  }

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      if (running) abortRef.current?.abort();
      else exit();
      return;
    }
    if (running) return;
    if (key.return) {
      const text = input.trim();
      if (text) void submit(text);
      return;
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta) return;
    if (char) setInput((prev) => prev + char);
  });

  return (
    <>
      <Static items={items}>
        {(item) => <ItemView key={item.id} item={item} />}
      </Static>

      {running && (
        <Box flexDirection="column">
          {liveReasoning ? (
            <Text dimColor>{liveReasoning.slice(-300)}</Text>
          ) : null}
          {liveText ? <Text>{liveText}</Text> : null}
          {liveTool ? (
            <Text dimColor>
              {"  "}running {liveTool.name} {liveTool.summary}...
            </Text>
          ) : null}
          {!liveText && !liveReasoning && !liveTool ? (
            <Text dimColor>thinking... (ctrl-c to stop)</Text>
          ) : null}
        </Box>
      )}

      <Box>
        <Text color={running ? "gray" : "cyan"}>{"> "}</Text>
        <Text>{input}</Text>
        <Text inverse> </Text>
      </Box>
    </>
  );
}
