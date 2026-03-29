// Embedded signaling server for host mode — uses `ws` (Node.js WebSocket).
// Starts on a configurable port so clients can connect directly to the host's IP.

import { createServer } from 'http';
import { networkInterfaces } from 'os';
import * as url from 'url';

type Role = 'host' | 'client';

interface RoomSlots {
  host?: import('ws').WebSocket;
  client?: import('ws').WebSocket;
}

const rooms = new Map<string, RoomSlots>();
const wsToRoom = new Map<import('ws').WebSocket, { room: string; role: Role }>();

let httpServer: ReturnType<typeof createServer> | null = null;
let wss: import('ws').WebSocketServer | null = null;

export function getLocalIPs(): string[] {
  const ips: string[] = [];
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

export async function startSignalingServer(port: number = 3001): Promise<{ port: number; ips: string[] }> {
  // Dynamic import ws (CommonJS module)
  const { WebSocketServer } = await import('ws');

  return new Promise((resolve, reject) => {
    httpServer = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200); res.end('ok');
      } else {
        res.writeHead(200); res.end('InputShare Signaling Server');
      }
    });

    wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    wss.on('connection', (ws, req) => {
      const parsed = url.parse(req.url || '', true);
      const room = parsed.query.room as string;
      const role = parsed.query.role as Role;

      if (!room || !role || (role !== 'host' && role !== 'client')) {
        ws.close(4000, 'Missing or invalid room/role params');
        return;
      }

      // Check if slot is taken
      const existing = rooms.get(room);
      if (existing && existing[role]) {
        ws.close(4009, `Room "${room}" already has a ${role}`);
        return;
      }

      // Register
      if (!rooms.has(room)) rooms.set(room, {});
      const slots = rooms.get(room)!;
      slots[role] = ws;
      wsToRoom.set(ws, { room, role });

      console.log(`[signaling] [${room}] ${role} connected`);

      // Notify other peer
      const otherRole: Role = role === 'host' ? 'client' : 'host';
      const other = slots[otherRole];
      if (other) {
        other.send(JSON.stringify({ type: 'peer-joined', role }));
        ws.send(JSON.stringify({ type: 'peer-joined', role: otherRole }));
      }

      // Relay messages
      ws.on('message', (message) => {
        const info = wsToRoom.get(ws);
        if (!info) return;
        const s = rooms.get(info.room);
        if (!s) return;
        const oRole: Role = info.role === 'host' ? 'client' : 'host';
        const o = s[oRole];
        if (o && o.readyState === 1) {
          // Forward as-is (string or binary)
          if (Buffer.isBuffer(message)) o.send(message);
          else if (message instanceof ArrayBuffer) o.send(message);
          else o.send(message.toString());
        }
      });

      ws.on('close', () => {
        const info = wsToRoom.get(ws);
        if (!info) return;
        const s = rooms.get(info.room);
        if (s) {
          delete s[info.role];
          const oRole: Role = info.role === 'host' ? 'client' : 'host';
          const o = s[oRole];
          if (o && o.readyState === 1) {
            o.send(JSON.stringify({ type: 'peer-disconnected', role: info.role }));
          }
          if (!s.host && !s.client) rooms.delete(info.room);
        }
        wsToRoom.delete(ws);
        console.log(`[signaling] [${info.room}] ${info.role} disconnected`);
      });
    });

    httpServer.on('error', reject);
    httpServer.listen(port, '0.0.0.0', () => {
      const ips = getLocalIPs();
      console.log(`[signaling] Signaling server running on port ${port}`);
      ips.forEach(ip => console.log(`[signaling]   ws://${ip}:${port}/ws`));
      resolve({ port, ips });
    });
  });
}

export function stopSignalingServer(): void {
  // Close all connections
  for (const [ws] of wsToRoom) {
    try { ws.close(); } catch {}
  }
  rooms.clear();
  wsToRoom.clear();

  if (wss) { try { wss.close(); } catch {} wss = null; }
  if (httpServer) { try { httpServer.close(); } catch {} httpServer = null; }
}
