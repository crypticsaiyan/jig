import { route } from "./routes";

export function startServer(port: number): void {
  // TODO: handle shutdown signals
  console.log(`listening on ${port}`);
  route("/");
}
