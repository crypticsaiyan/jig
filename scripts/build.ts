// builds jig into one self-contained executable: dist/jig
// usage: bun run build

import { join } from "node:path";

const root = join(import.meta.dir, "..");

const result = await Bun.build({
  entrypoints: [join(root, "src/index.tsx")],
  compile: {
    // bun's official portable runtime: needs only glibc 2.17, no system ICU,
    // so the binary runs in Debian/Ubuntu containers (Terminal-Bench), not just here
    target: "bun-linux-x64-baseline",
    outfile: join(root, "dist/jig"),
  },
  plugins: [
    {
      // ink loads react-devtools-core only in dev mode; the compiler still wires it in
      name: "stub-react-devtools",
      setup(build) {
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: "react-devtools-core",
          namespace: "stub",
        }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents:
            "export default { initialize() {}, connectToDevTools() {} };",
          loader: "js",
        }));
      },
    },
  ],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("built dist/jig");
