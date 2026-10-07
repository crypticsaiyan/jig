import { Box, Text } from "ink";
import type { PermKey, UserDecision } from "../permission/types";

export type AskRequest = {
  key: PermKey;
  decision: "ask" | "always-ask";
  resolve: (d: UserDecision) => void;
};

type Option = { label: string; value: UserDecision };

const LABELS: Record<PermKey["kind"], string> = {
  command: "run: ",
  path: "path: ",
  edit: "edit: ",
};

// always-ask actions are never saved to the allowlist, so only offer once or deny
export function optionsFor(
  key: PermKey,
  decision: "ask" | "always-ask",
): Option[] {
  if (decision === "always-ask") {
    return [
      { label: "allow once", value: "allow-once" },
      { label: "deny", value: "deny" },
    ];
  }
  // a prefix rule makes no sense for a file path
  if (key.kind === "edit") {
    return [
      { label: "allow once", value: "allow-once" },
      { label: "always allow edits to this file", value: "allow-always-exact" },
      { label: "deny", value: "deny" },
    ];
  }
  return [
    { label: "allow once", value: "allow-once" },
    { label: "always allow this exact command", value: "allow-always-exact" },
    { label: "always allow this command prefix", value: "allow-always-prefix" },
    { label: "deny", value: "deny" },
  ];
}

export function PermissionPrompt({
  request,
  selected,
}: {
  request: AskRequest;
  selected: number;
}) {
  const risky = request.decision === "always-ask";
  const options = optionsFor(request.key, request.decision);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={risky ? "red" : "yellow"}
      paddingX={1}
    >
      <Text bold color={risky ? "red" : "yellow"}>
        {risky
          ? "Risky action, needs approval every time"
          : "Permission needed"}
      </Text>
      <Text>
        {LABELS[request.key.kind]}
        {request.key.value}
      </Text>
      {options.map((o, i) => (
        <Text
          key={o.value}
          bold={i === selected}
          color={i === selected ? "cyan" : "gray"}
        >
          {i === selected ? "> " : "  "}
          {o.label}
        </Text>
      ))}
      <Text dimColor>up/down to move, enter to choose, esc to deny</Text>
    </Box>
  );
}
