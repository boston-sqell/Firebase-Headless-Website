#!/usr/bin/env node
/**
 * Custom entrypoint wrapping Astro's Node "standalone" server so the
 * process can shut down gracefully on SIGTERM/SIGINT.
 *
 * Why this exists: Cloud Run sends SIGTERM on scale-down, revision
 * replacement, and deploys, then SIGKILLs after a short grace period
 * (~10s) if the process hasn't exited. The generated dist/server/entry.mjs
 * starts listening as an import side effect and never hands back the
 * server instance, so there's nowhere to hook a shutdown handler. Instead:
 *
 *   1. Set ASTRO_NODE_AUTOSTART=disabled before importing the built entry
 *      -- @astrojs/node's standalone server checks this env var and skips
 *      self-starting when it's set (see node_modules/@astrojs/node/dist/server.js).
 *   2. Import the entry ourselves and call its exported startServer(),
 *      which starts listening AND returns { server, done }, where
 *      server.server is the underlying node http.Server.
 *   3. On SIGTERM/SIGINT: stop accepting new connections, immediately
 *      close idle keep-alive sockets (so they don't block shutdown), let
 *      in-flight requests finish, then exit -- forcing an exit if that
 *      takes too long so Cloud Run never has to SIGKILL us.
 *
 * This must stay a plain file at the repo root (not inside dist/) since
 * `npm run build` wipes and regenerates dist/ on every build.
 */

process.env.ASTRO_NODE_AUTOSTART = 'disabled';

const { startServer } = await import('./dist/server/entry.mjs');

const { server } = startServer();
const httpServer = server.server;

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

function log(severity, message, extra = {}) {
  console.log(JSON.stringify({ severity, message, ...extra }));
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  log('INFO', 'signal_received_shutting_down', { signal });

  const forceExit = setTimeout(() => {
    log('WARNING', 'graceful_shutdown_timed_out_forcing_exit', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  // Stop accepting new connections.
  httpServer.close((err) => {
    if (err) {
      log('ERROR', 'shutdown_error', { error: String(err) });
      process.exit(1);
    }
    log('INFO', 'shutdown_complete');
    process.exit(0);
  });

  // http.Server.close() only resolves once every socket is closed,
  // including idle keep-alive connections that may never close on their
  // own -- force those closed immediately so shutdown isn't blocked on
  // clients that are simply sitting idle. In-flight requests are
  // unaffected: this only targets sockets with no active request.
  httpServer.closeIdleConnections?.();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
