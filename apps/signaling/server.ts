// InputShare signaling server — Bun WebSocket
// Usage: bun run signaling/server.ts

type Role = 'host' | 'client';
type WS = import('bun').ServerWebSocket<{ room: string; role: Role }>;

interface RoomSlots {
  host?: WS;
  client?: WS;
}

const rooms = new Map<string, RoomSlots>();
const wsToRoom = new Map<WS, { room: string; role: Role }>();

const PORT = Number(process.env.PORT ?? 3001);

Bun.serve<{ room: string; role: Role }>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const room = url.searchParams.get('room');
      const role = url.searchParams.get('role') as Role | null;

      if (!room || !role || (role !== 'host' && role !== 'client')) {
        return new Response('Missing or invalid ?room=&role= params', { status: 400 });
      }

      // Check if slot is already taken
      const existing = rooms.get(room);
      if (existing && existing[role]) {
        return new Response(`Room "${room}" already has a ${role}`, { status: 409 });
      }

      const ok = server.upgrade(req, { data: { room, role } });
      if (!ok) return new Response('WebSocket upgrade failed', { status: 500 });
      return undefined;
    }

    return new Response('InputShare Signaling Server', { status: 200 });
  },

  websocket: {
    open(ws) {
      const { room, role } = ws.data;
      if (!rooms.has(room)) rooms.set(room, {});
      const slots = rooms.get(room)!;
      slots[role] = ws;
      wsToRoom.set(ws, { room, role });

      console.log(`[${room}] ${role} connected`);

      // Notify the other peer that someone joined
      const otherRole: Role = role === 'host' ? 'client' : 'host';
      const other = slots[otherRole];
      if (other) {
        other.send(JSON.stringify({ type: 'peer-joined', role }));
        ws.send(JSON.stringify({ type: 'peer-joined', role: otherRole }));
      }
    },

    message(ws, message) {
      const info = wsToRoom.get(ws);
      if (!info) return;

      const slots = rooms.get(info.room);
      if (!slots) return;

      // Relay to the other peer
      const otherRole: Role = info.role === 'host' ? 'client' : 'host';
      const other = slots[otherRole];
      if (other) {
        // Forward as-is (string or binary)
        other.send(message);
      }
    },

    close(ws) {
      const info = wsToRoom.get(ws);
      if (!info) return;

      const slots = rooms.get(info.room);
      if (slots) {
        delete slots[info.role];

        // Notify the other peer
        const otherRole: Role = info.role === 'host' ? 'client' : 'host';
        const other = slots[otherRole];
        if (other) {
          other.send(JSON.stringify({ type: 'peer-disconnected', role: info.role }));
        }

        // Clean up empty rooms
        if (!slots.host && !slots.client) {
          rooms.delete(info.room);
        }
      }

      wsToRoom.delete(ws);
      console.log(`[${info.room}] ${info.role} disconnected`);
    },
  },
});

console.log(`Signaling server running on ws://localhost:${PORT}/ws`);
