import { useRef, useCallback } from 'react';
import { PacketType, encodePing, decode, ICE_SERVERS } from '@inputshare/shared';
import type { AllowedDevices } from '@inputshare/shared';

interface UseClientWebRTCOptions {
  onStatusChange: (text: string, color: string) => void;
  onLatency: (rttMs: number, hostProcessingUs: number) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onCapabilities: (caps: AllowedDevices) => void;
}

export function useClientWebRTC({ onStatusChange, onLatency, onConnected, onDisconnected, onCapabilities }: UseClientWebRTCOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const reliableRef = useRef<RTCDataChannel | null>(null);
  const unreliableRef = useRef<RTCDataChannel | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendR = useCallback((buf: ArrayBuffer) => {
    const ch = reliableRef.current;
    if (ch && ch.readyState === 'open') ch.send(buf);
  }, []);

  const sendU = useCallback((buf: ArrayBuffer) => {
    const ch = unreliableRef.current;
    if (ch && ch.readyState === 'open') ch.send(buf);
  }, []);

  const stopPingLoop = useCallback(() => {
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
  }, []);

  const startPingLoop = useCallback(() => {
    stopPingLoop();
    pingRef.current = setInterval(() => {
      const ch = reliableRef.current;
      if (ch && ch.readyState === 'open') ch.send(encodePing(performance.now()));
    }, 1000);
  }, [stopPingLoop]);

  const closePeer = useCallback(() => {
    if (reliableRef.current) try { reliableRef.current.close(); } catch {}
    if (unreliableRef.current) try { unreliableRef.current.close(); } catch {}
    if (pcRef.current) try { pcRef.current.close(); } catch {}
    reliableRef.current = null; unreliableRef.current = null; pcRef.current = null;
  }, []);

  const createPeerAndOffer = useCallback(async () => {
    closePeer();
    onStatusChange('Creating peer connection...', 'yellow');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS as RTCIceServer[] });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', data: e.candidate }));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        onStatusChange('Connected', 'green');
        onConnected();
        startPingLoop();
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        onStatusChange('Connection lost', 'red');
        onDisconnected();
      }
    };

    const reliable = pc.createDataChannel('input-reliable', { ordered: true });
    reliable.binaryType = 'arraybuffer';
    reliable.onmessage = (e) => {
      try {
        const pkt = decode(e.data);
        if (pkt.type === PacketType.PONG) onLatency(performance.now() - pkt.timestamp, pkt.hostProcessingUs);
      } catch {}
    };
    reliableRef.current = reliable;

    const unreliable = pc.createDataChannel('input-unreliable', { ordered: false, maxRetransmits: 0 });
    unreliable.binaryType = 'arraybuffer';
    unreliableRef.current = unreliable;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'offer', data: offer }));
    }
  }, [closePeer, onStatusChange, startPingLoop, onConnected, onDisconnected, onLatency]);

  const handleSignaling = useCallback(async (msg: any) => {
    if (msg.type === 'capabilities') { onCapabilities(msg.data); return; }
    if (msg.type === 'peer-joined' && msg.role === 'host') { await createPeerAndOffer(); return; }
    if (msg.type === 'peer-disconnected') { onStatusChange('Host disconnected', 'red'); onDisconnected(); closePeer(); return; }
    let parsed = msg;
    if (typeof msg === 'string') parsed = JSON.parse(msg);
    if (parsed.type === 'answer' && pcRef.current) await pcRef.current.setRemoteDescription(new RTCSessionDescription(parsed.data));
    else if (parsed.type === 'ice-candidate' && parsed.data && pcRef.current) await pcRef.current.addIceCandidate(new RTCIceCandidate(parsed.data));
  }, [createPeerAndOffer, onStatusChange, onDisconnected, closePeer, onCapabilities]);

  const connect = useCallback((url: string, room: string) => {
    onStatusChange('Connecting...', 'yellow');
    const ws = new WebSocket(url + '?role=client&room=' + encodeURIComponent(room));
    wsRef.current = ws;
    ws.onopen = () => onStatusChange('Waiting for host...', 'yellow');
    ws.onmessage = (e) => handleSignaling(JSON.parse(e.data));
    ws.onclose = () => onStatusChange('Disconnected', 'gray');
    ws.onerror = () => onStatusChange('Connection error', 'red');
  }, [onStatusChange, handleSignaling]);

  const disconnect = useCallback(() => {
    stopPingLoop(); closePeer();
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    onStatusChange('Disconnected', 'gray');
  }, [stopPingLoop, closePeer, onStatusChange]);

  return { sendR, sendU, connect, disconnect, stopPingLoop };
}
