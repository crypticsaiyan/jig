import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { Banner } from "./Banner";
import type { Item } from "./types";
import { Markdown } from "./Markdown";

// label column that never shrinks
function Labeled({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Box flexShrink={0} marginRight={1}>
        <Text color={color}>{label}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}

export function ItemView({ item }: { item: Item }) {
  switch (item.kind) {
    case "banner":
      return <Banner />;
    case "user":
      return (
        <Labeled label="you:" color="cyan">
          <Text>{item.text}</Text>
        </Labeled>
      );
    case "assistant":
      return (
        <Labeled label="jig:" color="green">
          <Markdown text={item.text} />
        </Labeled>
      );
    case "error":
      return (
        <Labeled label="err:" color="red">
          <Text>{item.text}</Text>
        </Labeled>
      );
    case "tool":
      return (
        <Box>
          <Text dimColor>
            {"  "}
            {item.name} {item.summary}{" "}
          </Text>
          <Text color={item.ok ? "green" : "red"}>
            {item.ok ? "ok" : "error"}
          </Text>
        </Box>
      );
  }
}
