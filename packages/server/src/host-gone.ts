/**
 * The desktop host is gone: the app is quitting (ADR 0015). The server ends every ask the host can't answer now, closes
 * its sockets and services, then exits.
 */
export interface HostGoneDeps {
  /** Ends the page captures still waiting on the host. */
  capture: { close: () => void };
  /** The dev servers Featra started (STORY-25, ADR 0044). */
  devServers: { stopAll: () => void };
  /** Closes the sockets, then the services. */
  close: () => Promise<void>;
  exit: () => void;
}

export function whenHostGone({ capture, devServers, close, exit }: HostGoneDeps): Promise<void> {
  capture.close();
  // First, and at once: a quit gives the server only until the host exits. On Windows the host's exit then ends this
  // process and the dev server's shell, but not the server the shell started, which would keep running.
  devServers.stopAll();
  return close().finally(exit);
}
