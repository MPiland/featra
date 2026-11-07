// The real server client against a fake socket: only the network is faked.
import { expect } from "vitest";
import { createServerClient, type ServerEndpoint, type SocketFactory } from "../src/bridge.ts";

/**
 * The real client against a fake socket: only the network is faked. Each socket records what it was sent; the test
 * opens, answers and closes it the way a browser WebSocket would.
 */
type Listener = (event: { data?: unknown }) => void;
export class FakeSocket {
  readonly sent: { id: number; method: string; params: unknown }[] = [];
  readyState = 0;
  closed = false;
  private listeners = new Map<string, Listener[]>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text) as FakeSocket["sent"][number]);
  }
  close() {
    this.closed = true;
    this.emit("close", {});
  }
  emit(type: string, event: { data?: unknown }) {
    for (const l of this.listeners.get(type) ?? []) l(event);
  }
  open() {
    this.readyState = 1;
    this.emit("open", {});
  }
  answer(frame: unknown) {
    this.emit("message", { data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }
}

export const ENDPOINT: ServerEndpoint = { url: "ws://127.0.0.1:4100/v1", token: "s3cr/t+" };

export function setup(endpoints: (ServerEndpoint | null)[] = [ENDPOINT]) {
  const sockets: FakeSocket[] = [];
  let asked = 0;
  const open: SocketFactory = (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as ReturnType<SocketFactory>;
  };
  const client = createServerClient(async () => endpoints[Math.min(asked++, endpoints.length - 1)] ?? null, open);
  /** The newest socket, once the client has asked for one. */
  const socket = async () => {
    await expect.poll(() => sockets.length).toBeGreaterThan(0);
    return sockets.at(-1) as FakeSocket;
  };
  return { client, sockets, socket, asked: () => asked };
}
