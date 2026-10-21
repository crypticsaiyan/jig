// what counts as risky; command.ts, path.ts and the sandbox read these lists

// shell syntax that chains, pipes, substitutes or redirects
export const CHAINING = /&&|\|\||[;|`\n\r]|\$\(|>>|<<|[><]/;

// destructive commands; they always ask, even inside the sandbox
export const DESTRUCTIVE: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f\b/i, // rm -rf, rm -fr, etc.
  /\bgit\s+push\s+.*(--force|-f)\b/,
  /\bgit\s+reset\s+.*--hard\b/,
  /\bgit\s+clean\s+.*-f/,
  /\bgit\s+branch\s+-D\b/,
];

// files that usually hold secrets; they always ask, even inside the project
export const SENSITIVE: RegExp[] = [
  /^\.env(\..+)?$/i, // .env, .env.local, .env.production
  /\.(pem|key|p12|pfx)$/i, // certificates and private keys
  /^id_(rsa|ecdsa|ed25519|dsa)$/, // ssh private keys
  /^\.(npmrc|netrc|pgpass)$/, // tokens and passwords
];
export const NOT_SENSITIVE = /^\.env\.(example|sample|template)$/i;

// project paths that run or load later, outside the sandbox (git hooks, git config, skills);
// writes always ask, and the sandbox mounts them read-only
export const PROTECTED = [".git/hooks", ".git/config", ".jig"];
