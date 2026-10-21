// forward HTTPS (CONNECT) proxy + filters egress by domain allowlist

import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";

// allow subdomains
export function isAllowedHost(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith("." + d));
}

// starts the proxy on a socket file; returns a function that stops it
export function startProxy(
  socketPath: string,
  domains: string[],
): Promise<() => void> {
  rmSync(socketPath, { force: true }); // left over from a crashed run

  // plain http requests are refused; only HTTPS tunnels below
  const server = createServer((_req, res) => res.writeHead(405).end());

  // "CONNECT host:443": the tool asks for a tunnel to host
  server.on("connect", (req, client, head) => {
    const [host = "", port = ""] = (req.url ?? "").split(":");
    if (port !== "443" || !isAllowedHost(host, domains)) {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const site = connect(443, host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      site.write(head); // bytes the tool already sent
      // copy both ways until either side hangs up
      site.pipe(client);
      client.pipe(site);
    });
    site.on("error", () => client.destroy());
    client.on("error", () => site.destroy());
  });

  server.unref(); // the proxy alone shouldn't keep jig running after the UI exits
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () =>
      resolve(() => {
        server.close();
        rmSync(socketPath, { force: true });
      }),
    );
  });
}
