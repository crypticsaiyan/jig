import { Box, Text } from "ink";

const LINES = ["  ▀ ▀", "  █ █ █▀█", " ▄█ ▀ ▀██"];

export function Banner() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {LINES.map((line, i) => (
        <Text key={i} color="cyan">
          {line}
        </Text>
      ))}
    </Box>
  );
}
