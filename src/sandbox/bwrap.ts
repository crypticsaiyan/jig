// bubblewrap argv for running one bash command in a sandbox:
// whole filesystem read-only, project and /tmp writable, secrets and env hidden, no network

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SANDBOX } from "../config";
import { isSensitive } from "../permission/path";
import { PROTECTED } from "../permission/policy";

// hide a path
function mask(path: string): string[] {
  return statSync(path).isDirectory()
    ? ["--tmpfs", path] // creates empty dir at path
    : ["--ro-bind", "/dev/null", path]; // binds the file path to /dev/null
}

// proxy's socket file appears this inside the sandbox
const PROXY_SOCKET_INSIDE = "/tmp/jig-proxy.sock";

// socat: 127.0.0.1:JIG_PROXY_PORT -> /tmp/jig....
// then we wait (max 1s) for the port to accept
const BRIDGE = `
socat "TCP-LISTEN:$JIG_PROXY_PORT,bind=127.0.0.1,fork,reuseaddr" "UNIX-CONNECT:$JIG_PROXY_SOCKET" 2>/dev/null &
timeout 1 bash -c 'until (exec 3<>/dev/tcp/127.0.0.1/$JIG_PROXY_PORT); do sleep 0.02; done' 2>/dev/null
exec bash -c "$1"
`;

function networkFlags(): string[][] {
  const proxyUrl = `http://127.0.0.1:${SANDBOX.proxyPort}`;
  const env = {
    HTTPS_PROXY: proxyUrl,
    HTTP_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    http_proxy: proxyUrl,
    BUN_INSTALL_CACHE_DIR: "/tmp/cache/bun",
    npm_config_cache: "/tmp/cache/npm",
    XDG_CACHE_HOME: "/tmp/cache",
    // read by BRIDGE
    JIG_PROXY_PORT: String(SANDBOX.proxyPort),
    JIG_PROXY_SOCKET: PROXY_SOCKET_INSIDE,
  };
  return [
    ["--bind", SANDBOX.proxySocket, PROXY_SOCKET_INSIDE],
    ...Object.entries(env).map(([name, value]) => ["--setenv", name, value]),
  ];
}

export function sandboxArgs(
  command: string,
  projectRoot: string,
  network = false,
): string[] {
  const home = homedir();

  const secretsInHome = SANDBOX.maskedHome
    .map((p) => join(home, p))
    .filter((p) => existsSync(p));

  const secretsInProject = readdirSync(projectRoot)
    .map((name) => join(projectRoot, name))
    .filter((p) => isSensitive(p));

  const protectedPaths = PROTECTED.map((p) => join(projectRoot, p)).filter(
    (p) => existsSync(p),
  );

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
    ...(network ? networkFlags() : []), // after --tmpfs /tmp and --clearenv, or they would wipe it
    ["--chdir", projectRoot],
  ];
  // "bridge" fills $0, so the command lands in $1
  const run = network
    ? ["bash", "-c", BRIDGE, "bridge", command]
    : ["bash", "-c", command];
  return [...flags.flat(), ...run];
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

// socat bridges the sandbox's loopback port to the proxy's socket file
export function socatAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("socat", ["-V"], (error) => resolve(!error));
  });
}
