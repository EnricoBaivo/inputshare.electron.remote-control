import { useRef, useEffect, useCallback } from 'react';
import { ICE_SERVERS } from '@inputshare/shared';

interface UseHostWebRTCOptions {
  kbCheckedRef: React.MutableRefObject<boolean>;
  gpCheckedRef: React.MutableRefObject<boolean>;
}

export function useHostWebRTC({ kbCheckedRef, gpCheckedRef }: UseHostWebRTCOptions) {
  const sigWsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const createPC = useCallback(() => {
    if (pcRef.current) try { pcRef.current.close(); } catch {}
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS as RTCIceServer[] });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate && sigWsRef.current?.readyState === WebSocket.OPEN)
        sigWsRef.current.send(JSON.stringify({ type: 'ice-candidate', data: e.candidate }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') window.api.reportPeerStatus('connected');
      else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') window.api.reportPeerStatus('disconnected');
    };

    pc.ondatachannel = (event) => {
      const ch = event.channel;
      ch.binaryType = 'arraybuffer';
      ch.onmessage = async (e) => {
        const pong = await window.api.sendInput(e.data);
        if (pong) {
          let buf: ArrayBuffer = pong as any;
          if ((pong as any).buffer && (pong as any).byteOffset !== undefined) {
            const b = pong as any;
            buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
          }
          ch.send(buf);
        }
      };
    };
  }, []);

  const handleSigMsg = useCallback((msg: any) => {
    if (msg.type === 'peer-joined') {
      if (sigWsRef.current?.readyState === WebSocket.OPEN) {
        sigWsRef.current.send(JSON.stringify({ type: 'capabilities', data: { kb: kbCheckedRef.current, gp: gpCheckedRef.current } }));
      }
      createPC();
      return;
    }
    if (msg.type === 'peer-disconnected') {
      window.api.reportPeerStatus('disconnected');
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      return;
    }
    let parsed = msg;
    if (typeof msg === 'string') parsed = JSON.parse(msg);
    if (parsed.type === 'offer') {
      if (!pcRef.current) createPC();
      pcRef.current!.setRemoteDescription(new RTCSessionDescription(parsed.data)).then(async () => {
        const answer = await pcRef.current!.createAnswer();
        await pcRef.current!.setLocalDescription(answer);
        sigWsRef.current!.send(JSON.stringify({ type: 'answer', data: answer }));
      });
    } else if (parsed.type === 'ice-candidate' && parsed.data && pcRef.current) {
      pcRef.current.addIceCandidate(new RTCIceCandidate(parsed.data));
    }
  }, [createPC, kbCheckedRef, gpCheckedRef]);

  useEffect(() => {
    window.api.onStartWebRTC(async (config) => {
      const wsUrl = config.signalingUrl + '?role=host&room=' + encodeURIComponent(config.roomId);
      const ws = new WebSocket(wsUrl);
      sigWsRef.current = ws;

      ws.onopen = () => {
        window.api.reportPeerStatus('Waiting for client...');
        ws.send(JSON.stringify({ type: 'capabilities', data: { kb: kbCheckedRef.current, gp: gpCheckedRef.current } }));
      };
      ws.onmessage = (e) => handleSigMsg(JSON.parse(e.data));
      ws.onclose = () => window.api.reportPeerStatus('Signaling disconnected');
      ws.onerror = () => window.api.reportPeerStatus('Signaling error');
    });

    window.api.onStopWebRTC(() => {
      if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
      if (sigWsRef.current) { sigWsRef.current.close(); sigWsRef.current = null; }
    });
  }, [handleSigMsg, kbCheckedRef, gpCheckedRef]);
}
