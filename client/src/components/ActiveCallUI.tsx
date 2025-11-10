import { useEffect, useState, useRef } from "react";
import { Phone, Video, VideoOff, Mic, MicOff, PhoneOff, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { type Call } from "@shared/schema";

interface ActiveCallUIProps {
  call: Call;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  onToggleAudio: (enabled: boolean) => void;
  onToggleVideo: (enabled: boolean) => void;
}

export function ActiveCallUI({
  call,
  localStream,
  remoteStream,
  onEndCall,
  onToggleAudio,
  onToggleVideo,
}: ActiveCallUIProps) {
  const [duration, setDuration] = useState(0);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(call.type === "video");
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only start timer when call is active (both users connected)
    if (call.status !== "active" || !call.startedAt) {
      setDuration(0);
      return;
    }

    const interval = setInterval(() => {
      if (call.startedAt) {
        const elapsed = Math.floor((Date.now() - call.startedAt) / 1000);
        setDuration(elapsed);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [call.status, call.startedAt]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      // Explicitly play to ensure audio works
      remoteVideoRef.current.play().catch((error) => {
        console.error("[ActiveCallUI] Error playing remote video:", error);
      });
    }
  }, [remoteStream]);

  // Handle remote audio for voice calls
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream && call.type === "voice") {
      console.log("[ActiveCallUI] Setting up remote audio element for voice call");
      remoteAudioRef.current.srcObject = remoteStream;
      // Explicitly play to ensure audio works
      remoteAudioRef.current.play().catch((error) => {
        console.error("[ActiveCallUI] Error playing remote audio:", error);
      });
    }
  }, [remoteStream, call.type]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleToggleAudio = () => {
    const newState = !isAudioEnabled;
    setIsAudioEnabled(newState);
    onToggleAudio(newState);
  };

  const handleToggleVideo = () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    onToggleVideo(newState);
  };

  const handleToggleSpeaker = () => {
    const newState = !isSpeakerEnabled;
    setIsSpeakerEnabled(newState);
    
    // Control volume of remote audio/video elements
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !newState;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !newState;
    }
  };

  const handleEndCall = async () => {
    console.log(`[ActiveCallUI] End call button clicked, isEnding: ${isEndingCall}`);
    if (isEndingCall) {
      console.log(`[ActiveCallUI] Already ending call, ignoring click`);
      return;
    }
    setIsEndingCall(true);
    console.log(`[ActiveCallUI] Calling onEndCall handler...`);
    try {
      await onEndCall();
      console.log(`[ActiveCallUI] onEndCall handler completed`);
    } catch (error) {
      console.error(`[ActiveCallUI] Error in onEndCall:`, error);
      setIsEndingCall(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  const isVideo = call.type === "video";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-background z-50 flex flex-col"
      data-testid="active-call-ui"
    >
      {/* Hidden audio element for voice calls to play remote audio */}
      {!isVideo && (
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          data-testid="audio-remote"
        />
      )}
      
      <div className="flex-1 relative bg-black">
        {isVideo ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              data-testid="video-remote"
            />
            
            {localStream && (
              <div className="absolute bottom-4 right-4 w-32 h-24 bg-gray-900 rounded-lg overflow-hidden border-2 border-white">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                  data-testid="video-local"
                />
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <div className="text-center">
              <Avatar className="w-32 h-32 mx-auto mb-4">
                <AvatarFallback className="bg-primary/20 text-primary font-semibold text-4xl">
                  {getInitials(call.type === "voice" && call.callerId !== localStorage.getItem("chatUserId") ? call.callerUsername : call.receiverUsername)}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-2xl font-bold text-white mb-2">
                {call.callerId !== localStorage.getItem("chatUserId") ? call.callerUsername : call.receiverUsername}
              </h2>
            </div>
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex items-center justify-between text-white">
            <div>
              <p className="text-sm opacity-80">
                {call.callerId === localStorage.getItem("chatUserId") ? call.receiverUsername : call.callerUsername}
              </p>
              <p className="text-lg font-semibold" data-testid="text-call-duration">
                {call.status === "active" ? formatDuration(duration) : "Connecting..."}
              </p>
            </div>
            {isVideo && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20"
                data-testid="button-fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border-t border-border p-6">
        <div className="flex items-center justify-center gap-4">
          <Button
            size="lg"
            variant={isAudioEnabled ? "secondary" : "destructive"}
            className="rounded-full w-14 h-14"
            onClick={handleToggleAudio}
            data-testid="button-toggle-audio"
          >
            {isAudioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </Button>

          <Button
            size="lg"
            variant={isSpeakerEnabled ? "secondary" : "destructive"}
            className="rounded-full w-14 h-14"
            onClick={handleToggleSpeaker}
            data-testid="button-toggle-speaker"
          >
            {isSpeakerEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </Button>

          {isVideo && (
            <Button
              size="lg"
              variant={isVideoEnabled ? "secondary" : "destructive"}
              className="rounded-full w-14 h-14"
              onClick={handleToggleVideo}
              data-testid="button-toggle-video"
            >
              {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            </Button>
          )}

          <Button
            size="lg"
            variant="destructive"
            className="rounded-full w-16 h-16"
            onClick={handleEndCall}
            disabled={isEndingCall}
            data-testid="button-end-call"
          >
            <PhoneOff className="w-7 h-7" />
          </Button>
        </div>
      </div>
    </div>
  );
}
