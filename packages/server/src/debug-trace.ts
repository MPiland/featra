/** TEMPORARY (BUG-44 review): traces the watch and auto-merge to the server's stderr, which main.log keeps. */
export const trace = (message: string) => {
  process.stderr.write(`trace ${new Date().toISOString()} ${message}\n`);
};
