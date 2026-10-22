import { useEffect, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput, useStdout } from "ink";
import type { Item } from "./types";
import type { SystemMessage } from "../provider";
import type { CompleteStreamFunc } from "../provider/types";
import { isToolError, summarizeArgs } from "./summarize";
import { ItemView } from "./ItemView";
import {
  optionsFor,
  PermissionPrompt,
  type AskRequest,
} from "./PermissionPrompt";
import type { UserDecision, Asker, PermSession } from "../permission/types";
import type { Session } from "../session";
import { messagesToItems } from "./history";
import { UI } from "../config";
import type { LoopConfig } from "../loop/types";
import { StatusBar } from "./StatusBar";
import type { Registry } from "../tool/types";
import { runTurn } from "../loop/turn";

type Props = {
  systemPrompt: SystemMessage;
  session: Session;
  config: LoopConfig;
  tools: Registry;
  permissions: PermSession; // allowList grows as the user picks "allow always"
  complete: CompleteStreamFunc;
};
type LiveTool = { name: string; summary: string };

let nextId = 1;

export function App({
  systemPrompt,
  session,
  config,
  tools,
  permissions,
  complete,
}: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [resizeKey, setResizeKey] = useState(0); // new key remounts <Static>, reprinting every item
  const [items, setItems] = useState<Item[]>(() => [
    { id: 0, kind: "banner" },
    ...messagesToItems(session.state?.messages ?? [], () => nextId++),
  ]); // static items
  const [input, setInput] = useState("");
  const [liveText, setLiveText] = useState("");
  const [liveReasoning, setLiveReasoning] = useState("");
  const [liveTools, setLiveTools] = useState<LiveTool[]>([]); // running tools, index = depth
  const [running, setRunning] = useState(false);
  // spent since jig started (sub-agents included); not saved with the session
  const [spent, setSpent] = useState({
    costUsd: 0,
    promptTokens: 0,
    cachedTokens: 0,
  });

  // finished items are printed once at the current width; after a resize, clear and reprint them
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stdout.write("\x1b[2J\x1b[3J\x1b[H"); // clear screen and scrollback, cursor home
        setResizeKey((k) => k + 1);
      }, UI.resizeDebounceMs);
    };
    stdout.on("resize", onResize);
    return () => {
      clearTimeout(timer);
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef("");
  const [ask, setAsk] = useState<AskRequest | null>(null);
  const [selected, setSelected] = useState(0);
  const sessionRef = useRef(session);

  function push(kind: "user" | "assistant" | "error", text: string) {
    const id = nextId++;
    setItems((prev) => [...prev, { id, kind, text }]);
  }

  const pendingChildren = useRef<Item[]>([]); // child lines wait for their parent's line

  function pushTool(name: string, summary: string, ok: boolean, depth: number) {
    const item: Item = { id: nextId++, kind: "tool", name, summary, ok, depth };
    if (depth > 0) {
      pendingChildren.current.push(item);
      return;
    }
    setItems((prev) => [...prev, item, ...pendingChildren.current.splice(0)]);
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
    // submits the user query to runTurn
    const controller = new AbortController();
    abortRef.current = controller;
    push("user", text);
    setInput("");
    liveRef.current = "";
    setLiveText("");
    setLiveReasoning("");
    setRunning(true);

    try {
      const { result, budget, saveError } = await runTurn(
        text,
        sessionRef.current,
        { complete, systemPrompt, config, tools, permissions },
        {
          asker,
          signal: controller.signal,
          events: {
            onText: (c) => {
              liveRef.current += c;
              setLiveText(liveRef.current);
            },
            onReasoning: (c) => setLiveReasoning((p) => p + c),
            onToolStart: (call, depth) => {
              if (depth === 0) {
                flushText();
                setLiveReasoning("");
              }
              const tool = {
                name: call.name,
                summary: summarizeArgs(call.arguments),
              };
              setLiveTools((prev) => [...prev.slice(0, depth), tool]);
            },
            onToolResult: (call, result, depth) => {
              setLiveTools((prev) => prev.slice(0, depth));
              pushTool(
                call.name,
                summarizeArgs(call.arguments),
                !isToolError(result),
                depth,
              );
            },
          },
        },
      );
      if (saveError) push("error", "cant save session: " + saveError);
      setSpent((prev) => ({
        costUsd: prev.costUsd + budget.costUsd,
        promptTokens: prev.promptTokens + budget.promptTokens,
        cachedTokens: prev.cachedTokens + budget.cachedTokens,
      }));

      flushText(); // final answer

      if (result.stopReason !== "stop") {
        push("error", `stopped: ${result.stopReason}`);
      }
    } catch (e) {
      push("error", e instanceof Error ? e.message : String(e));
    } finally {
      setLiveText("");
      setLiveReasoning("");
      setLiveTools([]);
      pendingChildren.current = []; // drop lines left by an interrupted sub-agent
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

  const lastPromptTokens = sessionRef.current.state?.lastPromptTokens ?? 0;
  const contextPercent = Math.round(
    (lastPromptTokens / config.contextWindow) * 100,
  );
  const status = ask ? "waiting for permission" : running ? "running" : "idle";

  return (
    <>
      <Static key={resizeKey} items={items}>
        {(item) => (
          // Static lays items out without a width limit, so give each one the terminal width
          <Box key={item.id} width={stdout.columns || 80}>
            <ItemView item={item} />
          </Box>
        )}
      </Static>

      {running && (
        <Box flexDirection="column">
          {liveReasoning ? (
            <Text dimColor>{liveReasoning.slice(-UI.reasoningTailChars)}</Text>
          ) : null}
          {liveText ? <Text>{liveText}</Text> : null}
          {liveTools.map((tool, depth) => (
            <Text key={depth} dimColor>
              {"  ".repeat(depth + 1)}running {tool.name} {tool.summary}...
            </Text>
          ))}
          {!liveText && !liveReasoning && liveTools.length === 0 ? (
            <Text dimColor>thinking... (ctrl-c to stop)</Text>
          ) : null}
        </Box>
      )}

      {ask && <PermissionPrompt request={ask} selected={selected} />}

      <Box>
        <Box flexShrink={0} marginRight={1}>
          <Text color={running ? "gray" : "cyan"}>{">"}</Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {input}
            <Text inverse>{"\u00a0"}</Text>
          </Text>
        </Box>
      </Box>

      <StatusBar
        model={config.loopModel}
        contextTokens={lastPromptTokens}
        contextWindow={config.contextWindow}
        contextPercent={contextPercent}
        warnAt={Math.round(config.pruneRatio * 100)}
        dangerAt={Math.round(config.compactionRatio * 100)}
        title={sessionRef.current.title}
        status={status}
        costUsd={spent.costUsd}
        cacheRate={
          spent.promptTokens ? spent.cachedTokens / spent.promptTokens : 0
        }
      />
    </>
  );
}
