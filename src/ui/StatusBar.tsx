import { Box, Text } from "ink";

type Props = {
  model: string;
  contextPercent: number;
  contextTokens: number;
  contextWindow: number;
  warnAt: number; // percent where pruning starts
  dangerAt: number; // percent where compaction starts
  title: string;
  status: string;
};

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 100 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function StatusBar({
  model,
  contextWindow,
  contextTokens,
  contextPercent,
  warnAt,
  dangerAt,
  title,
  status,
}: Props) {
  const contextColor =
    contextPercent >= dangerAt
      ? "red"
      : contextPercent >= warnAt
        ? "yellow"
        : "gray";

  return (
    <Box width="100%" justifyContent="space-between">
      <Box>
        <Text dimColor>
          {model} · ctx {formatTokens(contextTokens)} /{" "}
          {formatTokens(contextWindow)}{" "}
        </Text>
        <Text color={contextColor}>{contextPercent}%</Text>
      </Box>
      <Text dimColor>
        {title || "new session"} . {status}
      </Text>
    </Box>
  );
}
