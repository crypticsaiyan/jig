import { useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import type { Item } from "./types";
import type { SystemMessage } from "../provider";
import { completeStream } from "../provider";
import { runLoop } from "../loop/loop";
import { isToolError, summarizeArgs } from "./summarize";
import { ItemView } from "./ItemView";
import {
  optionsFor,
  PermissionPrompt,
  type AskRequest,
} from "./PermissionPrompt";
import type { UserDecision, Asker, PermSession } from "../permission/types";
import { saveSession } from "../session/store";
import type { Session } from "../session";
import { messagesToItems } from "./history";

const permissions: PermSession = {
  allowList: [],
  projectRoot: process.cwd(),
};

type Props = { systemPrompt: SystemMessage; session: Session };
type LiveTool = { name: string; summary: string };

let nextId = 1;

export function App({ systemPrompt, session }: Props) {
  const { exit } = useApp();
  const [items, setItems] = useState<Item[]>(() => [
    { id: 0, kind: "banner" },
    ...messagesToItems(session.state?.messages ?? [], () => nextId++),
  ]); // static items
  const [input, setInput] = useState("");
  const [liveText, setLiveText] = useState("");
  const [liveReasoning, setLiveReasoning] = useState("");
  const [liveTool, setLiveTool] = useState<LiveTool | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef("");
  const [ask, setAsk] = useState<AskRequest | null>(null);
  const [selected, setSelected] = useState(0);
  const sessionRef = useRef(session);

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

  const asker: Asker = (key, decision) =>
    new Promise<UserDecision>((resolve) => {
      setSelected(0);
      setAsk({ key, decision, resolve });
    });

  function answer(decision: UserDecision) {
    ask?.resolve(decision);
    setAsk(null);
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
        state: sessionRef.current.state,
        complete: completeStream,
        config: {
          maxIterations: 20,
          maxTokens: 200000,
          contextWindow: 128000,
          systemPrompt,
          maxPruneAllowanceRatio: 0.1,
          compactionRatio: 0.9,
          pruneRatio: 0.5,
          loopModel: "openrouter/free",
          compactionModel: "openrouter/free",
          transcriptCapChars: 2000,
        },
        ctx: {
          asker,
          signal: controller.signal,
          maxOutputChars: 2000,
          permissions,
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
              !isToolError(result),
            );
          },
        },
      });

      sessionRef.current.state = result.state;
      sessionRef.current.updatedAt = Date.now().toString();
      if (sessionRef.current.title === "") {
        sessionRef.current.title = text.length > 50 ? text.slice(0, 50) : text;
      }

      try {
        await saveSession(sessionRef.current);
      } catch (error) {
        push("error", "cant save session: " + error);
      }

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
    if (ask) {
      const options = optionsFor(ask.key, ask.decision);
      if (key.ctrl && char === "c") {
        answer("deny"); // free the awaiting promise first
        abortRef.current?.abort();
        return;
      }
      if (key.upArrow) {
        setSelected((s) => (s - 1 + options.length) % options.length);
      } else if (key.downArrow) {
        setSelected((s) => (s + 1) % options.length);
      } else if (key.return) {
        const chosen = options[selected];
        if (chosen) answer(chosen.value);
      } else if (key.escape) {
        answer("deny");
      }
      return;
    }

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

      {ask && <PermissionPrompt request={ask} selected={selected} />}

      <Box>
        <Text color={running ? "gray" : "cyan"}>{"> "}</Text>
        <Text>{input}</Text>
        <Text inverse> </Text>
      </Box>
    </>
  );
}
