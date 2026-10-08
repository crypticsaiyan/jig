import { Box, Text } from "ink";
import { Banner } from "./Banner";
import type { Item } from "./types";
import { Markdown } from "./Markdown";

export function ItemView({ item }: { item: Item }) {
  switch (item.kind) {
    case "banner":
      return <Banner />;
    case "user":
      return (
        <Box>
          <Text color="cyan">you: </Text>
          <Text>{item.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box>
          <Text color="green">jig: </Text>
          <Box flexDirection="column" flexGrow={1}>
            <Markdown text={item.text} />
          </Box>
        </Box>
      );
    case "error":
      return (
        <Box>
          <Text color="red">err: </Text>
          <Text>{item.text}</Text>
        </Box>
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
