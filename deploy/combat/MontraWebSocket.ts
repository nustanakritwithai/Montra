import { WebSocketTransport } from "colyseus";

export function createMontraWebSocket(): WebSocketTransport {
  return new WebSocketTransport({
    pingInterval: 3000,
    // The first world snapshot can delay a pong on a slow mobile connection.
    pingMaxRetries: 5,
    perMessageDeflate: {
      threshold: 1024,
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
    },
  });
}
