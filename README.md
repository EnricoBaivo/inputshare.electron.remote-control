# InputShare

Remote keyboard, mouse, and gamepad sharing over WebRTC. A client Electron app
captures input on one PC and streams it to a host Electron app on a gaming PC,
which injects the input via Win32 `SendInput` and a ViGEm virtual Xbox 360
controller.

## Architecture

```
 Client PC                        Host (Gaming) PC
+--------------------------+     +----------------------------+
| Electron Client App      |     | Electron Host App          |
|                          |     |                            |
| capture.ts               |     | injector.ts  (SendInput)   |
|  keyboard / mouse /      | P2P |  keyboard + mouse inject   |
|  gamepad events     ---- | --> |                            |
|                     RTCDataChannel  gamepad.ts   (ViGEm)    |
| browser-native WebRTC    |     |  virtual X360 controller   |
|                          |     |                            |
| peer.ts (RTCPeerConn)    |     | peer.ts (@roamhq/wrtc)     |
+--------------------------+     +----------------------------+
            |                                |
            |   WebSocket (signaling only)   |
            +------>  signaling/server.ts  <-+
                       (Bun, port 3001)
```

The signaling server only brokers the initial WebRTC handshake (offer/answer
and ICE candidates). Once the peer-to-peer connection is established, all input
data flows directly between the two machines and the signaling server is no
longer in the data path.

Two DataChannels are used:

- **Mouse** -- unreliable, unordered (UDP-like) for lowest possible latency.
- **Keyboard / Gamepad** -- reliable, ordered to prevent stuck keys or missed
  button presses.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20 LTS** | Required on both host and client machines. |
| **Bun** | Used to run the signaling server (`signaling/server.ts`). |
| **Windows** | The host must be Windows (Win32 `SendInput` + ViGEm). The client can be any OS that runs Electron. |
| **ViGEmBus driver** | Required on the host only if you want gamepad support. See [Gamepad Setup](#7-gamepad-setup-vigembus). |

---

## 2. Quick Start

```bash
# 1. Clone and install
cd C:\dev\remote-control
npm install

# 2. Rebuild native addons for Electron
npx electron-rebuild -f -w ffi-napi,@roamhq/wrtc

# 3. Compile TypeScript
npm run build

# 4. Start the signaling server (on any machine reachable by both PCs)
bun run signaling/server.ts

# 5. Start the host (gaming PC)
npx electron host/main.js

# 6. Start the client (control PC)
npx electron client/main.js
```

Both apps connect to the signaling server, perform the WebRTC handshake, and
establish a direct peer-to-peer link. Input captured on the client is injected
on the host in real time.

---

## 3. Host Setup

The host runs on the gaming PC -- the machine where input will be injected.

1. Install dependencies and rebuild native addons:

   ```bash
   npm install
   npx electron-rebuild -f -w ffi-napi,@roamhq/wrtc
   npm run build
   ```

2. Run the host:

   ```bash
   npx electron host/main.js
   ```

   Or via the npm script:

   ```bash
   npm run host
   ```

The host uses `@roamhq/wrtc` to provide WebRTC in the Node.js main process and
`ffi-napi` to call Win32 `SendInput` for keyboard/mouse injection. Gamepad
input is injected through a ViGEm virtual Xbox 360 controller (see section 7).

**Key files:**

| File | Purpose |
|---|---|
| `host/main.ts` | Electron main process, app lifecycle |
| `host/preload.ts` | contextBridge exposing IPC to renderer |
| `host/peer.ts` | WebRTC host-side connection via `@roamhq/wrtc` |
| `host/injector.ts` | Win32 `SendInput` FFI bindings for keyboard and mouse |
| `host/gamepad.ts` | ViGEm FFI bindings for virtual X360 controller |
| `host/ui/` | Renderer HTML and CSS |

---

## 4. Client Setup

The client runs on the control PC -- the machine whose keyboard, mouse, and
gamepad you want to share.

1. Install dependencies and rebuild native addons:

   ```bash
   npm install
   npx electron-rebuild -f -w ffi-napi,@roamhq/wrtc
   npm run build
   ```

2. Run the client:

   ```bash
   npx electron client/main.js
   ```

   Or via the npm script:

   ```bash
   npm run client
   ```

The client uses the browser-native `RTCPeerConnection` in Electron's renderer
process -- no native WebRTC addon is needed on the client side.

**Pointer lock:** Click the capture zone in the client window to grab the
mouse. Press **Escape** to release the pointer lock and regain normal cursor
control.

**Latency display:** The client UI shows the current round-trip time (RTT). A
ping/pong message is exchanged every 1 second over the DataChannel.

**Key files:**

| File | Purpose |
|---|---|
| `client/main.ts` | Electron main process |
| `client/preload.ts` | contextBridge IPC |
| `client/peer.ts` | WebRTC client-side connection (browser-native) |
| `client/capture.ts` | Keyboard, mouse, and gamepad event capture |
| `client/ui/` | Renderer HTML and CSS (protocol codec is inlined) |

---

## 5. Network Configuration

### LAN (same local network)

This is the simplest case. Run the signaling server on either PC (or a third
machine) and point both apps at its local IP address.

```bash
# On the machine running the signaling server
bun run signaling/server.ts
# Listens on port 3001 by default. Override with:
PORT=4000 bun run signaling/server.ts
```

Both the host and client connect to `ws://<signaling-ip>:3001`. ICE
negotiation will find a direct LAN path automatically.

### Internet (different networks)

When the two PCs are on different networks, ICE may fail to establish a direct
connection due to NAT. You need a TURN relay server.

1. Obtain TURN credentials. A free option is [metered.ca](https://www.metered.ca/stun-turn)
   which offers a free tier.

2. Edit the `iceServers` configuration in both `host/peer.ts` and
   `client/peer.ts`:

   ```ts
   const config: RTCConfiguration = {
     iceServers: [
       { urls: "stun:stun.l.google.com:19302" },
       {
         urls: "turn:your-turn-server.example.com:443?transport=tcp",
         username: "your-username",
         credential: "your-credential",
       },
     ],
   };
   ```

3. Make sure the signaling server is reachable from both networks (run it on a
   public server, or port-forward).

**Note:** TURN relays add latency because traffic is forwarded through a third
party server rather than flowing directly between peers. For the best
experience, use a LAN connection or ensure STUN-based direct connectivity is
possible.

---

## 6. Signaling Server

The signaling server is a lightweight Bun WebSocket relay that forwards
SDP offers, answers, and ICE candidates between the host and client.

```bash
bun run signaling/server.ts
```

- Default port: **3001**
- Override: `PORT=<number> bun run signaling/server.ts`

Once the WebRTC peer connection is established, the signaling server is no
longer involved. You can stop it after the connection is up, though keeping it
running allows reconnections.

The server source is in `signaling/server.ts`.

---

## 7. Gamepad Setup (ViGEmBus)

Gamepad support requires the ViGEmBus driver and ViGEmClient library on the
host PC.

### Install ViGEmBus

1. Download the latest ViGEmBus release from
   [github.com/nefarius/ViGEmBus/releases](https://github.com/nefarius/ViGEmBus/releases).
2. Run the installer and reboot if prompted.

### ViGEmClient.dll

The host needs `ViGEmClient.dll` to communicate with the driver. Place it in
one of these locations:

- `host/lib/ViGEmClient.dll` (preferred -- checked first)
- The ViGEmBus system install path (checked as fallback)

### How it works

The client reads the local gamepad via the standard Gamepad API and sends
axis/button state over the reliable DataChannel. On the host, `gamepad.ts`
creates a virtual Xbox 360 controller through ViGEm. Games on the host see it
as a real USB gamepad.

If ViGEmBus is not installed, the host will still function for keyboard and
mouse -- gamepad injection will simply be unavailable.

---

## 8. Latency and Performance

- **Mouse channel** uses unreliable/unordered delivery (equivalent to UDP),
  minimizing latency for high-frequency pointer movement. A dropped packet just
  means one skipped position update.

- **Keyboard and gamepad channels** use reliable/ordered delivery to guarantee
  every key press and release arrives in sequence, preventing stuck keys.

- **RTT measurement:** The client sends a ping every 1 second and displays the
  round-trip time in the UI. On a local gigabit network, expect sub-millisecond
  RTT.

- **Binary protocol:** All input messages are encoded in a compact binary
  format (`shared/protocol.ts`) to minimize serialization overhead and payload
  size.

Tips for best performance:

- Use a wired Ethernet connection on both machines.
- Run the signaling server on the LAN to avoid WAN round-trips during the
  handshake.
- Avoid TURN if possible -- direct peer-to-peer is always faster.
- Close other applications that heavily use the network on the host.

---

## 9. Building Installers

Standalone `.exe` installers are produced with `electron-builder`.

```bash
# Build the host installer
npm run pack:host

# Build the client installer
npm run pack:client
```

These commands use the configuration files at `host/electron-builder.json` and
`client/electron-builder.json` respectively. Output artifacts are placed in the
`dist/` directory by default.

Make sure you have run `npm run build` before packaging so the compiled
JavaScript is up to date.

---

## 10. Troubleshooting

### `ffi-napi` or `@roamhq/wrtc` fails to load

The native addons must be rebuilt for the exact Electron version. Run:

```bash
npx electron-rebuild -f -w ffi-napi,@roamhq/wrtc
```

If you still see errors, ensure you have the Windows build tools installed:

```bash
npm install -g windows-build-tools
```

Or install the "Desktop development with C++" workload via Visual Studio
Installer.

### Connection never establishes

- Verify the signaling server is running and reachable from both machines.
- Check that both apps are pointed at the same signaling server address and
  port.
- On different networks, make sure you have configured a TURN server (see
  section 5).
- Check firewall rules -- WebRTC uses dynamic UDP ports for the peer
  connection.

### Mouse is not captured

Click inside the capture zone in the client window. The browser requests
pointer lock on click. If it does not engage, make sure the client window is
focused and not minimized.

Press **Escape** to release pointer lock.

### Keyboard input not reaching host

- Ensure the host app is running and the peer connection is established (the
  host UI should indicate a connected state).
- Some applications or games with anti-cheat may block `SendInput`. Run the
  host app as Administrator if input is not being received.

### Gamepad not detected by games

- Confirm ViGEmBus is installed (check Device Manager for "Virtual Gamepad
  Emulation Bus").
- Verify `ViGEmClient.dll` is present in `host/lib/` or on the system path.
- Some games only detect controllers that are present at launch. Start the host
  and establish the connection before launching the game.

### High latency

- Use wired Ethernet instead of Wi-Fi.
- Avoid TURN relays -- they add a network hop. If ICE selected a relay
  candidate, check your NAT/firewall configuration to allow direct connections.
- Monitor the RTT display in the client UI to confirm actual round-trip time.

### Signaling server port conflict

If port 3001 is in use, set a different port:

```bash
PORT=4000 bun run signaling/server.ts
```

Update the signaling server URL in both apps accordingly.
