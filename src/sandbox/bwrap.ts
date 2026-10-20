// bubblewrap argv for running one bash command in a sandbox:
// whole filesystem read-only, project and /tmp writable, secrets and env hidden, no network

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SANDBOX } from "../config";
import { isSensitive } from "../permission/match";

// hide a path
function mask(path: string): string[] {
  return statSync(path).isDirectory()
    ? ["--tmpfs", path] // creates empty dir at path
    : ["--ro-bind", "/dev/null", path]; // binds the file path to /dev/null
}

export function sandboxArgs(command: string, projectRoot: string): string[] {
  const home = homedir();

  const secretsInHome = SANDBOX.maskedHome
    .map((p) => join(home, p))
    .filter((p) => existsSync(p));

  const secretsInProject = readdirSync(projectRoot)
    .map((name) => join(projectRoot, name))
    .filter((p) => isSensitive(p));

  const protectedPaths = SANDBOX.protectedInProject
    .map((p) => join(projectRoot, p))
    .filter((p) => existsSync(p));

  const keptEnv = SANDBOX.keepEnv.flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [["--setenv", name, value]];
  });

  const flags = [
    ["--ro-bind", "/", "/"], // whole filesystem, read-only
    ["--dev", "/dev"],
    ["--proc", "/proc"],
    ["--tmpfs", "/tmp"], // private, writable, thrown away after
    ["--bind", projectRoot, projectRoot], // project writable
    ...protectedPaths.map((p) => ["--ro-bind", p, p]),
    ...[...secretsInHome, ...secretsInProject].map(mask),
    ["--unshare-net"], // no network
    ["--unshare-pid"],
    ["--die-with-parent"],
    ["--new-session"], // blocks typing into the parent terminal
    ["--clearenv"], // drop jig's env
    ...keptEnv,
    ["--chdir", projectRoot],
  ];
  return [...flags.flat(), "bash", "-c", command];
}

// runs a tiny real sandbox, since bwrap can be installed but blocked (e.g. AppArmor userns rules)
export function sandboxAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "bwrap",
      ["--ro-bind", "/", "/", "--unshare-net", "true"],
      (error) => resolve(!error),
    );
  });
}
