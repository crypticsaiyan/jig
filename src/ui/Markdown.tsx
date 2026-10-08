import { Box, Text } from "ink";
import { lexer, type MarkedToken, type Token, type Tokens } from "marked";

// inline tokens (inside a paragraph, heading, list item) become nested <Text>
function Inline({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <InlineToken key={i} token={t as MarkedToken} />
      ))}
    </>
  );
}

function InlineToken({ token }: { token: MarkedToken }) {
  switch (token.type) {
    case "strong":
      return (
        <Text bold>
          <Inline tokens={token.tokens} />
        </Text>
      );
    case "em":
      return (
        <Text italic>
          <Inline tokens={token.tokens} />
        </Text>
      );
    case "del":
      return (
        <Text strikethrough>
          <Inline tokens={token.tokens} />
        </Text>
      );
    case "codespan":
      return <Text color="cyan">{token.text}</Text>;
    case "link":
      return (
        <Text>
          <Text color="blue" underline>
            <Inline tokens={token.tokens} />
          </Text>
          {token.href !== token.text ? (
            <Text dimColor> ({token.href})</Text>
          ) : null}
        </Text>
      );
    case "image":
      return <Text dimColor>[image: {token.text}]</Text>;
    case "br":
      return <Text>{"\n"}</Text>;
    case "text":
      return token.tokens ? (
        <Inline tokens={token.tokens} />
      ) : (
        <Text>{token.text}</Text>
      );
    case "checkbox":
      return null; // the list marker already shows [ ] or [x]
    case "escape":
    case "html":
      return <Text>{token.text}</Text>;
    default:
      return <Text>{token.raw}</Text>;
  }
}

function List({ token }: { token: Tokens.List }) {
  const start = typeof token.start === "number" ? token.start : 1;
  return (
    <Box flexDirection="column">
      {token.items.map((item, i) => {
        const marker = item.task
          ? item.checked
            ? "[x]"
            : "[ ]"
          : token.ordered
            ? `${start + i}.`
            : "•";
        return (
          <Box key={i}>
            <Text>{marker} </Text>
            <Box flexDirection="column">
              <Blocks tokens={item.tokens} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// visible text of inline tokens (no markdown markers), used to measure columns
function plainText(tokens: Token[]): string {
  return tokens
    .map((t) => {
      const token = t as MarkedToken;
      if ("tokens" in token && token.tokens) return plainText(token.tokens);
      return "text" in token ? token.text : "";
    })
    .join("");
}

// spaces around a cell so it fills its column, honoring :--, :-:, --: alignment
function pad(
  width: number,
  used: number,
  align: "center" | "left" | "right" | null,
): [string, string] {
  const free = Math.max(0, width - used);
  if (align === "right") return [" ".repeat(free), ""];
  if (align === "center") {
    const left = Math.floor(free / 2);
    return [" ".repeat(left), " ".repeat(free - left)];
  }
  return ["", " ".repeat(free)];
}

// box-drawn grid
function Table({ token }: { token: Tokens.Table }) {
  const rows = [token.header, ...token.rows];
  const widths = token.header.map((_, col) =>
    Math.max(3, ...rows.map((r) => plainText(r[col]?.tokens ?? []).length)),
  );

  // ┌───┬───┐ style lines; each column is its width plus one space on each side
  const rule = (left: string, mid: string, right: string) =>
    left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right;

  const line = (row: Tokens.TableCell[], header: boolean) => (
    <Text>
      {"│"}
      {row.map((cell, c) => {
        const align = header ? "center" : (token.align[c] ?? null);
        const [before, after] = pad(
          widths[c] ?? 3,
          plainText(cell.tokens).length,
          align,
        );
        return (
          <Text key={c}>
            {" " + before}
            <Inline tokens={cell.tokens} />
            {after + " │"}
          </Text>
        );
      })}
    </Text>
  );

  return (
    <Box flexDirection="column">
      <Text>{rule("┌", "┬", "┐")}</Text>
      {rows.map((row, r) => (
        <Box key={r} flexDirection="column">
          {line(row, r === 0)}
          <Text>
            {r === rows.length - 1 ? rule("└", "┴", "┘") : rule("├", "┼", "┤")}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function Block({ token }: { token: MarkedToken }) {
  switch (token.type) {
    case "heading":
      return (
        <Text bold underline={token.depth === 1}>
          <Inline tokens={token.tokens} />
        </Text>
      );
    case "paragraph":
      return (
        <Text>
          <Inline tokens={token.tokens} />
        </Text>
      );
    case "text": // tight list items hold a block-level text token
      return token.tokens ? (
        <Text>
          <Inline tokens={token.tokens} />
        </Text>
      ) : (
        <Text>{token.text}</Text>
      );
    case "list":
      return <List token={token} />;
    case "code":
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          {token.lang ? <Text dimColor>{token.lang}</Text> : null}
          <Text>{token.text}</Text>
        </Box>
      );
    case "blockquote":
      return (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          paddingLeft={1}
        >
          <Blocks tokens={token.tokens} />
        </Box>
      );
    case "table":
      return <Table token={token} />;
    case "hr":
      return <Text dimColor>{"─".repeat(40)}</Text>;
    case "html":
      return <Text>{token.text}</Text>;
    case "space":
    case "checkbox":
    case "def":
      return null;
    default:
      return <Text>{token.raw}</Text>;
  }
}

function Blocks({ tokens, gap = 0 }: { tokens: Token[]; gap?: number }) {
  return (
    <Box flexDirection="column" gap={gap}>
      {tokens
        .filter((t) => t.type !== "space")
        .map((t, i) => (
          <Block key={i} token={t as MarkedToken} />
        ))}
    </Box>
  );
}

// renders a finished markdown string as Ink components
export function Markdown({ text }: { text: string }) {
  return <Blocks tokens={lexer(text)} gap={1} />;
}
