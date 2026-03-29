# InputShare - Remote Input Sharing over WebRTC

## What This Project Does

Remote input sharing system. A **client** Electron app captures keyboard, mouse, and gamepad input on one PC and streams it over a peer-to-peer WebRTC DataChannel to a **host** Electron app on a gaming PC, which injects the input into Windows via `SendInput()` (keyboard/mouse) and ViGEm virtual Xbox 360 controller (gamepad).

## Architecture

```
Client PC (renderer)          Host PC (renderer + main)
 Keyboard/Mouse/Gamepad        WebRTC DataChannel receive
 capture via DOM events   -->   IPC to main process
 WebRTC DataChannel send        main: decode binary packet
 Browser-native RTC             main: koffi -> SendInput() / ViGEm
                    \          /
                     Signaling Server (Bun WebSocket, port 3001)
                     Only used for WebRTC handshake, then out of path
```

**Key design decision:** Both host AND client use browser-native `RTCPeerConnection` in the renderer. The host originally used `@roamhq/wrtc` in the main process, but it causes segfaults in Electron 33. WebRTC was moved to the host renderer; input data flows renderer -> IPC -> main process for injection.

## Running

```bash
bun install                    # Install deps + link workspaces
npm run signaling              # Start signaling server (port 3001)
npm run build                  # Compile TypeScript + bundle renderer UI
npm run host                   # Launch host Electron app
npm run client                 # Launch client Electron app
```

## Build Requirements

- Node.js 22+, Bun (for signaling server + workspace management)
- After `bun install`, run: `npx @electron/rebuild -f -w koffi`
- This rebuilds koffi's native addon for Electron's ABI (different from Node's)
- `npm run build` runs `tsc` (main/preload → `dist/`) then `vite build` (renderer React UI → `dist/ui/`)

## Critical Technical Lessons Learned

### koffi in Electron
- **koffi must be rebuilt for Electron** via `@electron/rebuild -f -w koffi`. Without this, koffi's prebuilt binary targets Node's ABI, causing silent crashes in Electron's main process.
- **koffi type names are global and permanent.** `koffi.struct('Foo', ...)`, `koffi.proto('Bar', ...)`, `koffi.pointer('Baz', ...)` all register names globally. Calling them again with the same name throws "Duplicate type name". Always guard with `if (!type) { type = koffi.struct(...) }` or define types once at module scope.
- **Defer all koffi operations** until after `app.whenReady()`. Loading native DLLs or defining types at module top-level (import time) can crash Electron before it initializes. Use lazy loading inside `init()` methods, not at module scope.

### Electron IPC and ArrayBuffer
- **Electron IPC converts ArrayBuffer to Node.js Buffer** when crossing the renderer->main process boundary. Node.js Buffers may have a non-zero `byteOffset` into a shared memory pool. If you create `new DataView(buffer)` on a received Buffer, it reads from the wrong position (offset 0 of the pool, not the Buffer's actual data).
- **Fix:** Always convert before decoding:
  ```typescript
  if (Buffer.isBuffer(data)) {
    buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  ```

### @roamhq/wrtc is Incompatible with Electron 33
- Causes native segfault on `require()`. No error message, process just dies.
- Solution: Use browser-native `RTCPeerConnection` in the renderer process instead. The host renderer handles WebRTC signaling and DataChannels, forwarding binary input data to the main process via IPC for injection.

### ViGEmBus / ViGEmClient
- **ViGEmBus** (kernel driver) and **ViGEmClient.dll** (user-mode library) are separate. The driver installer does NOT include the DLL.
- The DLL must be built from source: clone `nefarius/ViGEmClient`, add `target_compile_definitions(ViGEmClientShared PRIVATE VIGEM_DYNAMIC VIGEM_EXPORTS)` to CMakeLists.txt, build with `-DViGEmClient_DLL=ON`. Without the export defines, the DLL has no exported functions.
- CMake bundled with VS Build Tools works even when node-gyp can't find VS: `"C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"`
- Place the built DLL in `apps/host/lib/ViGEmClient.dll`.
- **ViGEm controller naming:** The driver overrides device friendly names via its INF file. `SetupDiSetDeviceRegistryPropertyW(SPDRP_FRIENDLYNAME)` does not work. Custom VID/PID (`vigem_target_set_vid/pid`) is the only way to identify remote controllers. (The `setDeviceFriendlyName()` approach was removed — it blocked for ~1s enumerating devices and the result was overridden by the driver.)
- **Feedback loop on same machine:** When testing host+client on the same PC, the client's Gamepad API picks up the host's ViGEm virtual controllers, creating a loop. Filter by VID/PID in `pollGamepads()`.

### Global Input Capture (attempted, reverted)
- **Goal:** Capture keyboard/mouse/gamepad without requiring window focus, using Windows low-level hooks (`WH_KEYBOARD_LL`, `WH_MOUSE_LL`) and XInput polling via koffi.
- **Problem 1:** Low-level hooks require a Win32 message pump. Electron's main process has its own message loop, but koffi hook callbacks may not fire reliably through it. A manual `setInterval` + `PeekMessage/DispatchMessage` pump conflicts with Electron's loop.
- **Problem 2:** Global mouse hooks track absolute cursor position. When combined with pointer lock (which freezes the cursor), mouse deltas are always zero.
- **Problem 3:** Repeated `start()/stop()` cycles re-register koffi types, causing "Duplicate type name" crashes.
- **Status:** Reverted. Needs a different approach — possibly a separate native Node addon for hooks, or running hooks in a worker thread with its own message loop.

### ffi-napi is Dead
- `ffi-napi` + `ref-napi` + `ref-struct-di` require native compilation via node-gyp. node-gyp v9 (bundled with ffi-napi) cannot detect VS 2025 Build Tools. Replaced entirely with `koffi` which ships prebuilt binaries.

## Project Structure (Bun Workspaces)

```
packages/
  shared/                     @inputshare/shared — binary protocol, constants, types
    protocol.ts               Encoders, decoders, packet type enum
    constants.ts              ICE_SERVERS, VK_MAP, VK_NAMES
    types.ts                  AllowedDevices, LatencyInfo interfaces
    index.ts                  Barrel export
  ui/                         @inputshare/ui — shared React components + CSS
    components/               StatusBar, GuideOverlay, DeviceCheckboxes, LatencyDetail, FormGroup
    styles/base.css           Reset, typography, CSS custom properties (--accent, etc.)
    styles/components.css     Shared component styles (buttons, forms, status bars, guide overlay)

apps/
  host/                       @inputshare/host — host Electron app
    main.ts                   Electron main process, IPC handlers
    peer.ts                   Input routing: decode packets, inject via koffi, viz
    injector.ts               Win32 SendInput via koffi (keyboard/mouse)
    gamepad.ts                ViGEm X360 controller via koffi
    preload.ts                contextBridge IPC
    ui/App.tsx                Top-level host component
    ui/renderer.tsx           React mount point
    ui/style.css              Host-only styles (input monitor viz, red accent)
    ui/hooks/useHostWebRTC.ts WebRTC answer-side logic
    ui/components/HostForm.tsx             Signaling URL, room ID, device checks, start/stop
    ui/components/InputMonitor/index.tsx   Input visualization container
    ui/components/InputMonitor/MouseViz.tsx     Mouse buttons/movement/wheel
    ui/components/InputMonitor/KeyboardViz.tsx  Key grid
    ui/components/InputMonitor/GamepadViz.tsx   Sticks, triggers, buttons

  client/                     @inputshare/client — client Electron app
    main.ts                   Electron main process (minimal)
    preload.ts                contextBridge IPC
    ui/App.tsx                Top-level client component
    ui/renderer.tsx           React mount point
    ui/style.css              Client-only styles (capture zone, blue accent)
    ui/hooks/useClientWebRTC.ts  WebRTC offer-side logic
    ui/hooks/useInputCapture.ts  Keyboard/mouse event handlers
    ui/hooks/useLatency.ts       Ping/pong + RTT tracking
    ui/hooks/useGamepadPoll.ts   Gamepad API polling
    ui/components/ConnectPanel.tsx  Form + guide overlay
    ui/components/CapturePanel.tsx  Capture zone + latency display

  signaling/                  @inputshare/signaling — Bun WebSocket relay
    server.ts                 Room-based SDP/ICE forwarding

vite.config.ts               Builds both UIs to dist/ui/ (multi-entry)
tsconfig.json                Main process TypeScript config
tsconfig.renderer.json       Renderer TypeScript config (JSX, ESM)
```

## Binary Protocol (DataChannel)

| ID | Type | Size | Channel |
|----|------|------|---------|
| 0x01 | MOUSE_MOVE | 6B | unreliable (UDP-like) |
| 0x02 | MOUSE_BTN | 4B | reliable |
| 0x03 | MOUSE_WHEEL | 4B | reliable |
| 0x04 | KEY | 7B | reliable |
| 0x05 | PAD_STATE | 28B | reliable |
| 0x06 | PING | 9B | reliable |
| 0x07 | PONG | 11B | reliable (includes host processing time) |

## Current State / Known Issues

- Keyboard + mouse input works via DOM capture (requires client window focus + pointer lock)
- Gamepad capture via browser Gamepad API works but requires window focus
- Global capture (background input without focus) was attempted but reverted — needs a different approach
- ViGEm gamepad injection works when ViGEmBus driver + ViGEmClient.dll are present
- Host has an input monitor visualizing received keyboard/mouse/gamepad state
- Latency tracking shows RTT, one-way estimate, host processing time, rolling averages
- Device selection (KB+Mouse / Gamepad) configurable on host and client
