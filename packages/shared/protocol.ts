// ── Packet Types ─────────────���──────────────────────────────────
export enum PacketType {
  MOUSE_MOVE  = 0x01,
  MOUSE_BTN   = 0x02,
  MOUSE_WHEEL = 0x03,
  KEY         = 0x04,
  PAD_STATE   = 0x05,
  PING        = 0x06,
  PONG        = 0x07,
}

// ── Mouse Button IDs ─────────────���──────────────────────────────
export const MOUSE_LEFT   = 0;
export const MOUSE_RIGHT  = 1;
export const MOUSE_MIDDLE = 2;

// ── Encoders ────────��───────────────────────────────────────────

/** 6 bytes: type(1) + dx(2) + dy(2) + padding(1) — kept even for alignment */
export function encodeMouseMove(dx: number, dy: number): ArrayBuffer {
  const buf = new ArrayBuffer(6);
  const v = new DataView(buf);
  v.setUint8(0, PacketType.MOUSE_MOVE);
  v.setInt16(1, dx, true);
  v.setInt16(3, dy, true);
  return buf;
}

/** 4 bytes: type(1) + button(1) + down(1) + pad(1) */
export function encodeMouseBtn(button: number, down: boolean): ArrayBuffer {
  const buf = new ArrayBuffer(4);
  const v = new DataView(buf);
  v.setUint8(0, PacketType.MOUSE_BTN);
  v.setUint8(1, button);
  v.setUint8(2, down ? 1 : 0);
  return buf;
}

/** 4 bytes: type(1) + delta(2) + pad(1) */
export function encodeMouseWheel(delta: number): ArrayBuffer {
  const buf = new ArrayBuffer(4);
  const v = new DataView(buf);
  v.setUint8(0, PacketType.MOUSE_WHEEL);
  v.setInt16(1, delta, true);
  return buf;
}

/** 7 bytes: type(1) + vk(2) + scanCode(2) + down(1) + pad(1) */
export function encodeKey(vk: number, scanCode: number, down: boolean): ArrayBuffer {
  const buf = new ArrayBuffer(7);
  const v = new DataView(buf);
  v.setUint8(0, PacketType.KEY);
  v.setUint16(1, vk, true);
  v.setUint16(3, scanCode, true);
  v.setUint8(5, down ? 1 : 0);
  return buf;
}

/** 28 bytes: type(1) + index(1) + buttons(2) + axes(4×4=16) + triggers(2×4=8) */
export function encodePadState(
  index: number,
  buttons: number,
  axes: [number, number, number, number],
  triggers: [number, number]
): ArrayBuffer {
  const buf = new ArrayBuffer(28);
  const v = new DataView(buf);
  v.setUint8(0, PacketType.PAD_STATE);
  v.setUint8(1, index);
  v.setUint16(2, buttons, true);
  let off = 4;
  for (let i = 0; i < 4; i++) { v.setFloat32(off, axes[i], true); off += 4; }
  for (let i = 0; i < 2; i++) { v.setFloat32(off, triggers[i], true); off += 4; }
  return buf;
}

/** 9 bytes: type(1) + timestamp(8) */
export function encodePing(timestamp: number): ArrayBuffer {
  const buf = new ArrayBuffer(9);
  const v = new DataView(buf);
  v.setUint8(0, PacketType.PING);
  v.setFloat64(1, timestamp, true);
  return buf;
}

/** 11 bytes: type(1) + timestamp(8) + hostProcessingUs(2) */
export function encodePong(timestamp: number, hostProcessingUs: number = 0): ArrayBuffer {
  const buf = new ArrayBuffer(11);
  const v = new DataView(buf);
  v.setUint8(0, PacketType.PONG);
  v.setFloat64(1, timestamp, true);
  v.setUint16(9, Math.min(hostProcessingUs, 0xFFFF), true);
  return buf;
}

// ── Decoded packet types ────────────────────────────────────────
export type MouseMovePacket  = { type: PacketType.MOUSE_MOVE;  dx: number; dy: number };
export type MouseBtnPacket   = { type: PacketType.MOUSE_BTN;   button: number; down: boolean };
export type MouseWheelPacket = { type: PacketType.MOUSE_WHEEL;  delta: number };
export type KeyPacket        = { type: PacketType.KEY;          vk: number; scanCode: number; down: boolean };
export type PadStatePacket   = { type: PacketType.PAD_STATE;    index: number; buttons: number; axes: [number, number, number, number]; triggers: [number, number] };
export type PingPacket       = { type: PacketType.PING;         timestamp: number };
export type PongPacket       = { type: PacketType.PONG;         timestamp: number; hostProcessingUs: number };

export type Packet =
  | MouseMovePacket
  | MouseBtnPacket
  | MouseWheelPacket
  | KeyPacket
  | PadStatePacket
  | PingPacket
  | PongPacket;

// ── Decoder ──────────���──────────────────────────���───────────────
export function decode(buffer: ArrayBuffer): Packet {
  const v = new DataView(buffer);
  const type = v.getUint8(0) as PacketType;

  switch (type) {
    case PacketType.MOUSE_MOVE:
      return { type, dx: v.getInt16(1, true), dy: v.getInt16(3, true) };

    case PacketType.MOUSE_BTN:
      return { type, button: v.getUint8(1), down: v.getUint8(2) === 1 };

    case PacketType.MOUSE_WHEEL:
      return { type, delta: v.getInt16(1, true) };

    case PacketType.KEY:
      return {
        type,
        vk: v.getUint16(1, true),
        scanCode: v.getUint16(3, true),
        down: v.getUint8(5) === 1,
      };

    case PacketType.PAD_STATE: {
      const axes: [number, number, number, number] = [0, 0, 0, 0];
      const triggers: [number, number] = [0, 0];
      let off = 4;
      for (let i = 0; i < 4; i++) { axes[i] = v.getFloat32(off, true); off += 4; }
      for (let i = 0; i < 2; i++) { triggers[i] = v.getFloat32(off, true); off += 4; }
      return { type, index: v.getUint8(1), buttons: v.getUint16(2, true), axes, triggers };
    }

    case PacketType.PING:
      return { type, timestamp: v.getFloat64(1, true) };

    case PacketType.PONG: {
      const hostProcessingUs = buffer.byteLength >= 11 ? v.getUint16(9, true) : 0;
      return { type, timestamp: v.getFloat64(1, true), hostProcessingUs };
    }

    default:
      throw new Error(`Unknown packet type: 0x${(type as number).toString(16)}`);
  }
}
