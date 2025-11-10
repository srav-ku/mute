import { ref, onValue, set, remove, update, type Unsubscribe } from "firebase/database";
import { type WebRTCSignal, type Call } from "@shared/schema";

let database: any;

async function getDatabase() {
  if (database) return database;
  const { initializeApp } = await import("firebase/app");
  const { getDatabase: getDB } = await import("firebase/database");
  
  const response = await fetch("/api/config/firebase");
  const firebaseConfig = await response.json();
  const app = initializeApp(firebaseConfig);
  database = getDB(app);
  return database;
}

// Firebase call state management
export async function initializeCallState(call: Call): Promise<void> {
  const db = await getDatabase();
  const callStateRef = ref(db, `call-states/${call.id}`);
  await set(callStateRef, {
    status: "ringing",
    callerId: call.callerId,
    receiverId: call.receiverId,
    type: call.type,
    timestamp: call.timestamp,
  });
}

export async function updateCallState(callId: string, updates: { status?: string; startedAt?: number; endedAt?: number }): Promise<void> {
  const db = await getDatabase();
  const callStateRef = ref(db, `call-states/${callId}`);
  await update(callStateRef, updates);
}

export async function subscribeToCallState(
  callId: string,
  callback: (state: { status: string; startedAt?: number; endedAt?: number }) => void
): Promise<Unsubscribe> {
  const db = await getDatabase();
  const callStateRef = ref(db, `call-states/${callId}`);
  
  return onValue(callStateRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    }
  });
}

export async function subscribeToCallStateWithRemoval(
  callId: string,
  callback: (state: { status: string; startedAt?: number; endedAt?: number } | null) => void
): Promise<Unsubscribe> {
  const db = await getDatabase();
  const callStateRef = ref(db, `call-states/${callId}`);
  
  return onValue(callStateRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback(null);
    }
  });
}

export async function removeCallState(callId: string): Promise<void> {
  const db = await getDatabase();
  const callStateRef = ref(db, `call-states/${callId}`);
  await remove(callStateRef);
}

export interface CallConfig {
  audio: boolean;
  video: boolean;
}

export interface CallEventHandlers {
  onRemoteStream?: (stream: MediaStream) => void;
  onCallEnded?: () => void;
  onCallAccepted?: () => void;
  onError?: (error: Error) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onCallStateChange?: (state: { status: string; startedAt?: number; endedAt?: number }) => void;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private callId: string = "";
  private userId: string = "";
  private otherUserId: string = "";
  private signalUnsubscribe: Unsubscribe | null = null;
  private callStateUnsubscribe: Unsubscribe | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private handlers: CallEventHandlers = {};
  private isCallEnded: boolean = false;
  private currentVideoDevice: string | null = null;
  private isCallActive: boolean = false;

  private readonly iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  constructor(userId: string) {
    this.userId = userId;
  }

  setHandlers(handlers: CallEventHandlers) {
    this.handlers = handlers;
  }

  async initializeCall(
    callId: string,
    otherUserId: string,
    config: CallConfig,
    isInitiator: boolean
  ): Promise<void> {
    console.log(`[WebRTC] Initializing call ${callId} as ${isInitiator ? 'initiator' : 'receiver'}`);
    console.log(`[WebRTC] Config:`, config);
    
    this.callId = callId;
    this.otherUserId = otherUserId;
    this.isCallEnded = false;
    this.isCallActive = false;

    try {
      console.log(`[WebRTC] Requesting media permissions...`);
      // Force front camera only by using facingMode: "user"
      const mediaConstraints: MediaStreamConstraints = {
        audio: config.audio,
        video: config.video ? { facingMode: "user" } : false
      };
      this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      console.log(`[WebRTC] Media stream obtained:`, {
        audioTracks: this.localStream.getAudioTracks().length,
        videoTracks: this.localStream.getVideoTracks().length
      });
      
      // Track the current video device
      if (config.video && this.localStream) {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          this.currentVideoDevice = settings.deviceId || null;
          console.log(`[WebRTC] Current video device (front camera):`, this.currentVideoDevice);
        }
      }

      console.log(`[WebRTC] Setting up peer connection...`);
      this.setupPeerConnection();
      
      // Subscribe to call state changes
      this.callStateUnsubscribe = await subscribeToCallState(callId, (state) => {
        console.log(`[WebRTC] Call state changed:`, state);
        this.handlers.onCallStateChange?.(state);
        
        // Start recording only when call becomes active for the first time
        if (state.status === "active" && !this.isCallActive) {
          console.log(`[WebRTC] Call is now active, starting recording`);
          this.isCallActive = true;
          this.startRecording();
        }
        
        // Handle call ended state - only notify handler, don't call cleanup directly
        // This prevents duplicate triggers since cleanup will be called from handleEndCall
        if (state.status === "ended" && !this.isCallEnded) {
          console.log(`[WebRTC] Call ended, triggering onCallEnded handler`);
          this.isCallEnded = true;
          this.handlers.onCallEnded?.();
        }
      });

      if (isInitiator) {
        console.log(`[WebRTC] Creating offer as initiator...`);
        await this.createOffer();
      } else {
        console.log(`[WebRTC] Waiting for offer as receiver...`);
      }

      console.log(`[WebRTC] Starting to listen for signals...`);
      await this.listenForSignals();
    } catch (error) {
      console.error("[WebRTC] Error initializing call:", error);
      this.handlers.onError?.(error as Error);
      throw error;
    }
  }

  private setupPeerConnection() {
    console.log(`[WebRTC] Setting up RTCPeerConnection with ICE servers:`, this.iceServers);
    this.peerConnection = new RTCPeerConnection(this.iceServers);
    this.remoteStream = new MediaStream();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        console.log(`[WebRTC] Adding local ${track.kind} track to peer connection`);
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    this.peerConnection.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track:`, event.track.kind);
      event.streams[0].getTracks().forEach((track) => {
        this.remoteStream?.addTrack(track);
      });
      if (this.remoteStream) {
        console.log(`[WebRTC] Triggering onRemoteStream handler`);
        this.handlers.onRemoteStream?.(this.remoteStream);
        
        // If call is already active and we now have both streams, start recording
        if (this.isCallActive && this.localStream && !this.mediaRecorder) {
          console.log(`[WebRTC] Call is active and remote stream received, starting recording now`);
          this.startRecording();
        }
      }
    };

    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] Generated ICE candidate:`, event.candidate.type);
        await this.sendSignal({
          callId: this.callId,
          fromUserId: this.userId,
          toUserId: this.otherUserId,
          type: "ice-candidate",
          payload: event.candidate.toJSON(),
          timestamp: Date.now(),
        });
        console.log(`[WebRTC] Sent ICE candidate to peer`);
      } else {
        console.log(`[WebRTC] ICE candidate gathering complete`);
      }
    };

    this.peerConnection.oniceconnectionstatechange = async () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTC] ICE connection state changed:`, state);
      
      if (state) {
        this.handlers.onIceConnectionStateChange?.(state);
      }

      // When ICE connection is established, mark call as active
      if (state === "connected" || state === "completed") {
        if (!this.isCallActive) {
          console.log(`[WebRTC] ICE connection established, marking call as active`);
          try {
            await updateCallState(this.callId, {
              status: "active",
              startedAt: Date.now(),
            });
          } catch (error) {
            console.error("[WebRTC] Error updating call state to active:", error);
          }
        }
      }

      // Don't trigger onCallEnded here - let the call state subscription handle it
      // This prevents multiple redundant end call triggers
    };

    this.peerConnection.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state changed:`, this.peerConnection?.signalingState);
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state changed:`, this.peerConnection?.connectionState);
    };
  }

  private async createOffer() {
    if (!this.peerConnection) {
      console.error(`[WebRTC] Cannot create offer: peer connection not initialized`);
      return;
    }

    console.log(`[WebRTC] Creating offer...`);
    const offer = await this.peerConnection.createOffer();
    console.log(`[WebRTC] Offer created:`, offer.type);
    
    await this.peerConnection.setLocalDescription(offer);
    console.log(`[WebRTC] Local description set (offer)`);

    console.log(`[WebRTC] Sending offer signal to peer...`);
    await this.sendSignal({
      callId: this.callId,
      fromUserId: this.userId,
      toUserId: this.otherUserId,
      type: "offer",
      payload: offer,
      timestamp: Date.now(),
    });
    console.log(`[WebRTC] Offer signal sent successfully`);
  }

  async acceptCall() {
    console.log(`[WebRTC] acceptCall() called`);
    
    if (!this.peerConnection) {
      console.error(`[WebRTC] Cannot accept call: peer connection not initialized`);
      return;
    }

    // Check if we have a remote description (the offer)
    if (!this.peerConnection.remoteDescription) {
      console.warn(`[WebRTC] No remote description yet, waiting for offer before accepting...`);
      // The answer will be created automatically when we receive the offer in handleSignal
      // Don't update to active yet - wait for ICE connection
    } else {
      console.log(`[WebRTC] Remote description already set, answer should have been sent`);
    }
    
    // Don't manually set call to "active" here - let ICE connection state handle it
    // This ensures the call only becomes "active" when peers are actually connected
    
    console.log(`[WebRTC] Call accepted, triggering onCallAccepted handler`);
    this.handlers.onCallAccepted?.();
  }

  private async listenForSignals() {
    const db = await getDatabase();
    const signalRef = ref(db, `webrtc-signals/${this.callId}/${this.userId}`);

    this.signalUnsubscribe = onValue(signalRef, async (snapshot) => {
      if (!snapshot.exists()) return;

      const signals: WebRTCSignal[] = [];
      snapshot.forEach((childSnapshot) => {
        const signal = childSnapshot.val() as WebRTCSignal;
        if (signal.fromUserId !== this.userId) {
          signals.push({ ...signal, id: childSnapshot.key });
        }
      });

      for (const signal of signals) {
        await this.handleSignal(signal);
        const signalToRemove = ref(db, `webrtc-signals/${this.callId}/${this.userId}/${(signal as any).id}`);
        await remove(signalToRemove);
      }
    });
  }

  private async handleSignal(signal: WebRTCSignal) {
    if (!this.peerConnection) {
      console.error(`[WebRTC] Cannot handle signal: peer connection not initialized`);
      return;
    }

    console.log(`[WebRTC] Handling signal of type: ${signal.type} from ${signal.fromUserId}`);

    try {
      switch (signal.type) {
        case "offer":
          console.log(`[WebRTC] Received offer, setting remote description...`);
          
          // Defensive check: ensure we're in the right state
          if (this.peerConnection.signalingState !== "stable" && this.peerConnection.signalingState !== "have-local-offer") {
            console.warn(`[WebRTC] Unexpected signaling state for offer: ${this.peerConnection.signalingState}`);
          }
          
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
          console.log(`[WebRTC] Remote description set (offer), creating answer...`);
          
          const answer = await this.peerConnection.createAnswer();
          console.log(`[WebRTC] Answer created:`, answer.type);
          
          await this.peerConnection.setLocalDescription(answer);
          console.log(`[WebRTC] Local description set (answer)`);
          
          console.log(`[WebRTC] Sending answer signal to peer...`);
          await this.sendSignal({
            callId: this.callId,
            fromUserId: this.userId,
            toUserId: this.otherUserId,
            type: "answer",
            payload: answer,
            timestamp: Date.now(),
          });
          console.log(`[WebRTC] Answer signal sent successfully`);
          break;

        case "answer":
          console.log(`[WebRTC] Received answer, setting remote description...`);
          
          // Defensive check
          if (this.peerConnection.signalingState !== "have-local-offer") {
            console.warn(`[WebRTC] Unexpected signaling state for answer: ${this.peerConnection.signalingState}`);
          }
          
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
          console.log(`[WebRTC] Remote description set (answer) - handshake complete!`);
          break;

        case "ice-candidate":
          console.log(`[WebRTC] Received ICE candidate`);
          
          // Defensive check: only add ICE candidates after remote description is set
          if (!this.peerConnection.remoteDescription) {
            console.warn(`[WebRTC] Cannot add ICE candidate: no remote description set yet`);
            return;
          }
          
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
          console.log(`[WebRTC] ICE candidate added successfully`);
          break;

        case "end-call":
        case "reject-call":
          console.log(`[WebRTC] Received ${signal.type} signal`);
          // Mark as ended to prevent further processing
          // The cleanup will happen when handleEndCall is called from the UI
          if (!this.isCallEnded) {
            this.isCallEnded = true;
            console.log(`[WebRTC] Call marked as ended due to ${signal.type} signal`);
          }
          break;
      }
    } catch (error) {
      console.error(`[WebRTC] Error handling ${signal.type} signal:`, error);
    }
  }

  private async sendSignal(signal: WebRTCSignal) {
    const db = await getDatabase();
    const signalRef = ref(db, `webrtc-signals/${this.callId}/${signal.toUserId}`);
    const newSignalRef = ref(db, `webrtc-signals/${this.callId}/${signal.toUserId}/${Date.now()}`);
    await set(newSignalRef, signal);
  }

  private async startRecording() {
    if (!this.localStream || !this.remoteStream) {
      console.log('[WebRTC] Waiting for both streams before starting recording', {
        hasLocal: !!this.localStream,
        hasRemote: !!this.remoteStream
      });
      return;
    }

    console.log('[WebRTC] Creating mixed stream for recording with Web Audio API');
    
    try {
      // Create AudioContext for mixing
      this.audioContext = new AudioContext();
      
      // Resume AudioContext to ensure it starts immediately (some browsers suspend by default)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('[WebRTC] AudioContext resumed');
      }
      
      // Create source nodes for both local and remote audio
      const localSource = this.audioContext.createMediaStreamSource(this.localStream);
      const remoteSource = this.audioContext.createMediaStreamSource(this.remoteStream);
      
      // Create destination node for mixed audio
      const destination = this.audioContext.createMediaStreamDestination();
      
      // Connect both sources to destination (this mixes the audio)
      localSource.connect(destination);
      remoteSource.connect(destination);
      
      console.log('[WebRTC] Audio sources connected and mixed via AudioContext');
      
      // Create mixed stream with properly mixed audio
      const mixedAudioStream = destination.stream;
      
      // Create final stream with mixed audio
      const tracks: MediaStreamTrack[] = [];
      
      // Add mixed audio track
      const mixedAudioTrack = mixedAudioStream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        console.log('[WebRTC] Adding mixed audio track to final stream');
        tracks.push(mixedAudioTrack);
      }
      
      // For video calls, also include the local video track
      const localVideoTracks = this.localStream.getVideoTracks();
      if (localVideoTracks.length > 0) {
        console.log('[WebRTC] Adding local video track to final stream');
        tracks.push(localVideoTracks[0]);
      }
      
      this.mixedStream = new MediaStream(tracks);
      console.log('[WebRTC] Mixed stream created with tracks:', {
        audioTracks: this.mixedStream.getAudioTracks().length,
        videoTracks: this.mixedStream.getVideoTracks().length
      });

      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9',
      };

      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'video/webm';
        }
      }

      console.log('[WebRTC] Starting MediaRecorder with properly mixed stream');
      this.mediaRecorder = new MediaRecorder(this.mixedStream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log(`[WebRTC] Recording chunk received: ${event.data.size} bytes`);
        }
      };

      this.mediaRecorder.start(1000);
      console.log('[WebRTC] MediaRecorder started successfully with mixed audio from both users');
    } catch (error) {
      console.error("[WebRTC] Error starting recording:", error);
    }
  }

  async getRecording(): Promise<Blob | null> {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      return new Promise((resolve) => {
        if (!this.mediaRecorder) {
          resolve(null);
          return;
        }

        this.mediaRecorder.onstop = () => {
          if (this.recordedChunks.length > 0) {
            const blob = new Blob(this.recordedChunks, { type: "video/webm" });
            resolve(blob);
          } else {
            resolve(null);
          }
        };

        this.mediaRecorder.stop();
      });
    }

    if (this.recordedChunks.length > 0) {
      return new Blob(this.recordedChunks, { type: "video/webm" });
    }

    return null;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  toggleVideo(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  async flipCamera() {
    console.log(`[WebRTC] flipCamera() called`);
    
    if (!this.localStream) {
      console.error(`[WebRTC] Cannot flip camera: no local stream`);
      return;
    }

    if (!this.peerConnection) {
      console.error(`[WebRTC] Cannot flip camera: no peer connection`);
      return;
    }

    try {
      console.log(`[WebRTC] Enumerating video devices...`);
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      console.log(`[WebRTC] Found ${videoDevices.length} video devices:`, videoDevices.map(d => d.label));
      
      if (videoDevices.length < 2) {
        console.warn(`[WebRTC] Only one camera available, cannot flip`);
        return;
      }

      // Find the next camera (cycle through available cameras)
      const currentIndex = videoDevices.findIndex(device => device.deviceId === this.currentVideoDevice);
      const nextIndex = (currentIndex + 1) % videoDevices.length;
      const nextDevice = videoDevices[nextIndex];

      console.log(`[WebRTC] Switching from camera ${currentIndex} to camera ${nextIndex}: ${nextDevice.label}`);

      // Get new stream with the next camera
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId } },
        audio: true,
      });

      // Replace video track in peer connection
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = this.localStream.getVideoTracks()[0];

      console.log(`[WebRTC] Replacing video track in peer connection...`);
      const sender = this.peerConnection.getSenders().find(s => s.track === oldVideoTrack);
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
        console.log(`[WebRTC] Video track replaced successfully`);
      } else {
        console.error(`[WebRTC] Could not find sender for old video track`);
      }

      // Stop old video track
      oldVideoTrack.stop();
      console.log(`[WebRTC] Old video track stopped`);

      // Replace track in local stream
      this.localStream.removeTrack(oldVideoTrack);
      this.localStream.addTrack(newVideoTrack);

      // Stop audio track from new stream (we already have audio)
      newStream.getAudioTracks().forEach(track => track.stop());

      // Update current device
      this.currentVideoDevice = nextDevice.deviceId;

      console.log(`[WebRTC] Camera flipped successfully to: ${nextDevice.label}`);
    } catch (error) {
      console.error(`[WebRTC] Error flipping camera:`, error);
    }
  }

  async endCall() {
    console.log(`[WebRTC] endCall() called, isCallEnded=${this.isCallEnded}`);
    
    // Idempotent: only execute once
    if (this.isCallEnded) {
      console.log("[WebRTC] Call already ended, skipping duplicate end call");
      return;
    }
    
    this.isCallEnded = true;
    console.log(`[WebRTC] Ending call ${this.callId}...`);

    // Stop recording if active
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      console.log(`[WebRTC] Stopping media recorder (state: ${this.mediaRecorder.state})`);
      this.mediaRecorder.stop();
    }

    // Immediately cleanup local resources for fast UI response
    console.log(`[WebRTC] Starting immediate cleanup...`);
    this.cleanup();

    // Send signals and update Firebase in background (don't await)
    this.cleanupRemoteResources().catch(error => {
      console.error("[WebRTC] Error in background cleanup:", error);
    });
    
    console.log(`[WebRTC] Call ended (local cleanup complete, remote cleanup in progress)`);
  }

  private async cleanupRemoteResources() {
    // Send end-call signal to other peer
    try {
      console.log(`[WebRTC] Sending end-call signal to peer...`);
      await this.sendSignal({
        callId: this.callId,
        fromUserId: this.userId,
        toUserId: this.otherUserId,
        type: "end-call",
        payload: null,
        timestamp: Date.now(),
      });
      console.log(`[WebRTC] End-call signal sent successfully`);
    } catch (error) {
      console.error("[WebRTC] Error sending end-call signal:", error);
    }

    // Update call state to "ended" in Firebase
    try {
      console.log(`[WebRTC] Updating call state to 'ended' in Firebase...`);
      await updateCallState(this.callId, {
        status: "ended",
        endedAt: Date.now(),
      });
      console.log(`[WebRTC] Call state updated to 'ended'`);
    } catch (error) {
      console.error("[WebRTC] Error updating call state to ended:", error);
    }

    // Remove call state after a delay
    try {
      console.log(`[WebRTC] Scheduling call state removal...`);
      setTimeout(async () => {
        try {
          await removeCallState(this.callId);
          console.log(`[WebRTC] Call state removed from Firebase`);
        } catch (error) {
          console.error("[WebRTC] Error removing call state:", error);
        }
      }, 3000);
    } catch (error) {
      console.error("[WebRTC] Error scheduling removal:", error);
    }
  }

  async rejectCall() {
    if (this.isCallEnded) {
      console.log("Call already ended, skipping reject");
      return;
    }
    
    this.isCallEnded = true;

    try {
      await this.sendSignal({
        callId: this.callId,
        fromUserId: this.userId,
        toUserId: this.otherUserId,
        type: "reject-call",
        payload: null,
        timestamp: Date.now(),
      });

      await updateCallState(this.callId, {
        status: "rejected",
        endedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error rejecting call:", error);
    }

    this.cleanup();
  }

  private cleanup() {
    console.log(`[WebRTC] Starting cleanup for call ${this.callId}...`);
    
    if (this.signalUnsubscribe) {
      console.log(`[WebRTC] Unsubscribing from signals...`);
      this.signalUnsubscribe();
      this.signalUnsubscribe = null;
    }

    if (this.callStateUnsubscribe) {
      console.log(`[WebRTC] Unsubscribing from call state...`);
      this.callStateUnsubscribe();
      this.callStateUnsubscribe = null;
    }

    if (this.localStream) {
      console.log(`[WebRTC] Stopping local stream tracks...`);
      this.localStream.getTracks().forEach((track) => {
        console.log(`[WebRTC] Stopping ${track.kind} track`);
        track.stop();
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      console.log(`[WebRTC] Closing peer connection (state: ${this.peerConnection.connectionState})...`);
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.audioContext) {
      console.log(`[WebRTC] Closing AudioContext...`);
      this.audioContext.close();
      this.audioContext = null;
    }

    this.remoteStream = null;
    this.mixedStream = null;
    this.recordedChunks = [];
    
    console.log(`[WebRTC] Local cleanup complete`);
  }
}

export async function subscribeToIncomingCalls(
  userId: string,
  callback: (call: Call) => void
): Promise<Unsubscribe> {
  const db = await getDatabase();
  const callsRef = ref(db, `incoming-calls/${userId}`);

  return onValue(callsRef, (snapshot) => {
    if (!snapshot.exists()) return;

    snapshot.forEach((childSnapshot) => {
      const call = childSnapshot.val() as Call;
      if (call.status === "ringing") {
        callback(call);
      }
    });
  });
}

export async function sendIncomingCall(call: Call): Promise<void> {
  const db = await getDatabase();
  const callRef = ref(db, `incoming-calls/${call.receiverId}/${call.id}`);
  await set(callRef, call);
}

export async function removeIncomingCall(userId: string, callId: string): Promise<void> {
  const db = await getDatabase();
  const callRef = ref(db, `incoming-calls/${userId}/${callId}`);
  await remove(callRef);
}

export async function updateCallStatus(
  userId: string,
  callId: string,
  updates: Partial<Call>
): Promise<void> {
  const db = await getDatabase();
  const callRef = ref(db, `incoming-calls/${userId}/${callId}`);
  const currentData = await new Promise<Call | null>((resolve) => {
    onValue(callRef, (snapshot) => {
      resolve(snapshot.exists() ? snapshot.val() : null);
    }, { onlyOnce: true });
  });

  if (currentData) {
    await set(callRef, { ...currentData, ...updates });
  }
}
