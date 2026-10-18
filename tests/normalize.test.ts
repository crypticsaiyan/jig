import { describe, expect, test } from "bun:test";
import { normalizeStream } from "../src/provider/normalize";
import {
  finishChunk,
  stream,
  textChunk,
  toolChunk,
  usageChunk,
} from "./helpers";

describe("normalizeStream", () => {
  test("joins text chunks and streams each one", async () => {
    const seen: string[] = [];
    const res = await normalizeStream(
      stream([
        textChunk("hel"),
        textChunk("lo "),
        textChunk("there"),
        finishChunk("stop"),
        usageChunk(10, 3),
      ]),
      { onText: (c) => seen.push(c) },
    );
    expect(res.message.content).toBe("hello there");
    expect(seen).toEqual(["hel", "lo ", "there"]);
    expect(res.finishReason).toBe("stop");
    expect(res.stats).toEqual({
      promptTokens: 10,
      completionTokens: 3,
      totalTokens: 13,
    });
  });

  test("rebuilds one tool call from fragments", async () => {
    const res = await normalizeStream(
      stream([
        toolChunk(0, { id: "call_1", name: "bash" }),
        toolChunk(0, { args: '{"comm' }),
        toolChunk(0, { args: 'and":"l' }),
        toolChunk(0, { args: 's"}' }),
        finishChunk("tool_calls"),
        usageChunk(1, 1),
      ]),
    );
    expect(res.finishReason).toBe("tool_calls");
    expect(res.message.content).toBeNull();
    expect(res.message.toolCalls).toEqual([
      { toolCallId: "call_1", name: "bash", arguments: '{"command":"ls"}' },
    ]);
  });

  test("keeps interleaved tool calls apart by index", async () => {
    const res = await normalizeStream(
      stream([
        toolChunk(0, { id: "a", name: "read_file" }),
        toolChunk(1, { id: "b", name: "bash" }),
        toolChunk(0, { args: '{"path":"x"}' }),
        toolChunk(1, { args: '{"command":"pwd"}' }),
        finishChunk("tool_calls"),
        usageChunk(1, 1),
      ]),
    );
    expect(res.message.toolCalls).toEqual([
      { toolCallId: "a", name: "read_file", arguments: '{"path":"x"}' },
      { toolCallId: "b", name: "bash", arguments: '{"command":"pwd"}' },
    ]);
  });

  test("throws without usage", async () => {
    expect(
      normalizeStream(stream([textChunk("hi"), finishChunk("stop")])),
    ).rejects.toThrow("Error fetching stats");
  });

  test("throws on unknown finish reason", async () => {
    expect(
      normalizeStream(stream([finishChunk("weird"), usageChunk(1, 1)])),
    ).rejects.toThrow("Non-standard finish reason");
  });

  test("throws on a stream error chunk", async () => {
    const errorChunk = {
      ...usageChunk(1, 1),
      error: { code: 500, message: "upstream down" },
    };
    expect(normalizeStream(stream([errorChunk]))).rejects.toThrow(
      "Stream error: upstream down",
    );
  });
});
