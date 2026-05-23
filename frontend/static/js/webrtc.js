/**
 * webrtc.js — WebRTC P2P video/audio via Django Channels signaling
 * 
 * Flow:
 *   Peer A (host) connects → waits
 *   Peer B joins → server sends "peer_joined" to A
 *   A creates offer → sends via WS → B receives → creates answer
 *   ICE candidates exchange → P2P video established
 */

const RTC = (() => {
  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  let ws = null;
  let pc = null;          // RTCPeerConnection
  let localStream = null;
  let isInitiator = false;
  let micOn = true;
  let camOn = true;

  // DOM refs — set by init()
  let localVideo, remoteVideo;

  // Callbacks
  let onStatus = () => {};
  let onPartnerJoined = () => {};
  let onPartnerLeft = () => {};

  /* ── Public init ─────────────────────────────────────── */
  async function init({ roomId, localVideoEl, remoteVideoEl, statusCb, joinedCb, leftCb }) {
    localVideo  = localVideoEl;
    remoteVideo = remoteVideoEl;
    onStatus        = statusCb   || onStatus;
    onPartnerJoined = joinedCb   || onPartnerJoined;
    onPartnerLeft   = leftCb     || onPartnerLeft;

    await startLocalMedia();
    connectWS(roomId);
  }

  /* ── Media ───────────────────────────────────────────── */
  async function startLocalMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
      onStatus('camera_ok');
    } catch (err) {
      console.error('Media error:', err);
      onStatus('camera_error');
      alert('Kamera/mikrofonga ruxsat bering va sahifani qayta yuklab ko\'ring.\n\n' + err.message);
    }
  }

  function toggleMic() {
    if (!localStream) return;
    micOn = !micOn;
    localStream.getAudioTracks().forEach(t => t.enabled = micOn);
    return micOn;
  }

  function toggleCam() {
    if (!localStream) return;
    camOn = !camOn;
    localStream.getVideoTracks().forEach(t => t.enabled = camOn);
    return camOn;
  }

  /* ── WebSocket signaling ─────────────────────────────── */
  function connectWS(roomId) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws/room/${roomId}/`);

    ws.onopen = () => {
      console.log('[WS] Connected');
      onStatus('ws_open');
    };

    ws.onclose = () => {
      console.warn('[WS] Closed');
      onStatus('ws_closed');
    };

    ws.onerror = (e) => console.error('[WS] Error', e);

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      console.log('[WS] ←', msg.type);

      switch (msg.type) {
        case 'peer_joined':
          // We are the existing peer → become initiator and send offer
          isInitiator = true;
          onPartnerJoined(msg.username);
          await createPeerConnection();
          await sendOffer();
          break;

        case 'offer':
          isInitiator = false;
          onPartnerJoined(msg.username || 'Partner');
          await createPeerConnection();
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: 'answer', sdp: pc.localDescription });
          break;

        case 'answer':
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          break;

        case 'ice_candidate':
          if (pc && msg.candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); }
            catch (e) { console.warn('ICE add error', e); }
          }
          break;

        case 'peer_left':
          onPartnerLeft();
          resetPC();
          break;
      }
    };
  }

  /* ── RTCPeerConnection ───────────────────────────────── */
  async function createPeerConnection() {
    if (pc) pc.close();

    pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Receive remote stream
    pc.ontrack = ({ streams }) => {
      if (streams[0]) {
        remoteVideo.srcObject = streams[0];
        onStatus('connected');
      }
    };

    // Send ICE candidates via WS
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send({ type: 'ice_candidate', candidate });
    };

    pc.onconnectionstatechange = () => {
      console.log('[PC] state:', pc.connectionState);
      onStatus(pc.connectionState);
    };
  }

  async function sendOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: 'offer', sdp: pc.localDescription });
  }

  function resetPC() {
    if (pc) { pc.close(); pc = null; }
    remoteVideo.srcObject = null;
    onStatus('disconnected');
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  /* ── Cleanup ─────────────────────────────────────────── */
  function hangup() {
    send({ type: 'peer_left' });
    resetPC();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (ws) ws.close();
  }

  return { init, toggleMic, toggleCam, hangup };
})();
