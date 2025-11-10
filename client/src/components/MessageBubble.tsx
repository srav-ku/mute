import { Check, CheckCheck, Paperclip, X, Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { useState, useRef } from "react";
import { type Message } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { formatMessageTime } from "@/lib/formatTime";

interface MessageBubbleProps {
  message: Message;
  isOwnMessage?: boolean;
  isGroupChat?: boolean;
  onClickSender?: (senderId: string, senderUsername: string) => void;
}

export function MessageBubble({
  message,
  isOwnMessage = false,
  isGroupChat = false,
  onClickSender,
}: MessageBubbleProps) {
  const [imagePreview, setImagePreview] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoMuted, setVideoMuted] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getReadReceiptIcon = () => {
    if (!isOwnMessage) return null;
    
    if (message.readAt) {
      return (
        <div className="flex items-center gap-0.5 text-primary-foreground dark:text-primary-foreground" data-testid="icon-read-receipt">
          <CheckCheck className="w-3.5 h-3.5" />
        </div>
      );
    }
    
    if (message.deliveredAt) {
      return (
        <div className="flex items-center gap-0.5 text-primary-foreground/80 dark:text-primary-foreground/80" data-testid="icon-delivered-receipt">
          <CheckCheck className="w-3.5 h-3.5" />
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-0.5 text-primary-foreground/70 dark:text-primary-foreground/70" data-testid="icon-sent-receipt">
        <Check className="w-3.5 h-3.5" />
      </div>
    );
  };

  const toggleAudioPlay = () => {
    if (audioRef.current) {
      if (isAudioPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsAudioPlaying(!isAudioPlaying);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsAudioPlaying(false);
    setAudioCurrentTime(0);
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setAudioCurrentTime(time);
    }
  };

  const toggleVideoPlay = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setVideoCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const handleVideoEnded = () => {
    setIsVideoPlaying(false);
    setVideoCurrentTime(0);
  };

  const handleVideoSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setVideoCurrentTime(time);
    }
  };

  const toggleVideoMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setVideoMuted(!videoMuted);
    }
  };

  const toggleVideoFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (message.deleted) {
    return (
      <div
        className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-2 px-2 sm:px-0`}
        data-testid={`message-${message.id}`}
      >
        <div className="max-w-[85%] sm:max-w-md md:max-w-lg lg:max-w-xl message-bubble-enter">
          <div className={`px-4 py-2 rounded-xl ${isOwnMessage ? "bg-muted/10 rounded-tr-sm" : "bg-muted/10 rounded-tl-sm"}`}>
            <p className="text-sm italic text-muted-foreground/60" data-testid="text-deleted-message">
              [Message deleted]
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-2 px-2 sm:px-0`}
        data-testid={`message-${message.id}`}
      >
        <div className="max-w-[85%] sm:max-w-md md:max-w-lg lg:max-w-xl message-bubble-enter">
          {isGroupChat && !isOwnMessage && (
            <button
              onClick={() => onClickSender?.(message.senderId, message.senderUsername)}
              className="text-xs text-primary hover:underline font-medium mb-0.5 ml-1 cursor-pointer"
              data-testid={`button-sender-${message.senderId}`}
            >
              {message.senderUsername}
            </button>
          )}
          <div
            className={`rounded-xl ${
              isOwnMessage
                ? "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground rounded-tr-sm"
                : "bg-card text-card-foreground dark:bg-card dark:text-card-foreground rounded-tl-sm shadow-sm"
            } ${message.mediaUrl && !message.text ? '' : 'px-4 py-2'}`}
          >
            {message.mediaUrl && !message.mediaDeleted && (
              <div className={message.text ? "mb-2" : ""}>
                {mediaLoadError ? (
                  <div className={`p-4 rounded-lg ${
                    isOwnMessage 
                      ? "bg-primary-foreground/10 dark:bg-primary-foreground/10" 
                      : "bg-muted/50 dark:bg-muted/50"
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-destructive/10 dark:bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <X className="w-5 h-5 text-destructive dark:text-destructive" />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${
                          isOwnMessage 
                            ? "text-primary-foreground dark:text-primary-foreground" 
                            : "text-foreground dark:text-foreground"
                        }`}>
                          Media Unavailable
                        </p>
                        <p className={`text-xs ${
                          isOwnMessage 
                            ? "text-primary-foreground/60 dark:text-primary-foreground/60" 
                            : "text-muted-foreground dark:text-muted-foreground"
                        }`}>
                          This file is no longer available
                        </p>
                      </div>
                    </div>
                  </div>
                ) : message.mediaType === "image" ? (
                  <img
                    src={message.mediaUrl}
                    alt="Uploaded media"
                    className="max-w-full sm:max-w-sm w-full rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={() => setImagePreview(true)}
                    onError={() => setMediaLoadError(true)}
                    data-testid={`img-media-${message.id}`}
                  />
                ) : message.mediaType === "video" ? (
                  <div className="relative rounded-lg overflow-hidden max-w-full sm:max-w-sm group">
                    <video
                      ref={videoRef}
                      src={message.mediaUrl}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onEnded={handleVideoEnded}
                      onError={() => setMediaLoadError(true)}
                      onClick={toggleVideoPlay}
                      className="w-full rounded-lg cursor-pointer"
                      style={{
                        maxHeight: '400px',
                        objectFit: 'contain',
                        backgroundColor: 'black'
                      }}
                      data-testid={`video-media-${message.id}`}
                    />
                    
                    {/* Video Controls Overlay */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isVideoPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleVideoPlay}
                        className="w-16 h-16 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm"
                        data-testid={`button-video-play-${message.id}`}
                      >
                        {isVideoPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
                      </Button>
                    </div>

                    {/* Video Controls Bar */}
                    <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 transition-opacity ${isVideoPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                      <input
                        type="range"
                        min="0"
                        max={videoDuration || 0}
                        value={videoCurrentTime}
                        onChange={handleVideoSeek}
                        className="w-full h-1 rounded-full appearance-none cursor-pointer bg-white/30 mb-2"
                        style={{
                          background: `linear-gradient(to right, white 0%, white ${(videoCurrentTime / (videoDuration || 1)) * 100}%, rgba(255,255,255,0.3) ${(videoCurrentTime / (videoDuration || 1)) * 100}%, rgba(255,255,255,0.3) 100%)`
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleVideoPlay}
                            className="h-7 w-7 text-white hover:bg-white/20"
                            data-testid={`button-video-controls-play-${message.id}`}
                          >
                            {isVideoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                          <span className="text-xs text-white font-medium">
                            {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleVideoMute}
                            className="h-7 w-7 text-white hover:bg-white/20"
                            data-testid={`button-video-mute-${message.id}`}
                          >
                            {videoMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleVideoFullscreen}
                            className="h-7 w-7 text-white hover:bg-white/20"
                            data-testid={`button-video-fullscreen-${message.id}`}
                          >
                            <Maximize2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : message.mediaType === "audio" ? (
                  <div className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg min-w-[240px] sm:min-w-[280px] ${
                    isOwnMessage 
                      ? "bg-primary-foreground/10 dark:bg-primary-foreground/10" 
                      : "bg-muted/50 dark:bg-muted/50"
                  }`}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleAudioPlay}
                      className={`flex-shrink-0 h-10 w-10 rounded-full ${
                        isOwnMessage
                          ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground dark:bg-primary-foreground/20 dark:hover:bg-primary-foreground/30 dark:text-primary-foreground"
                          : "bg-primary/20 hover:bg-primary/30 text-primary dark:bg-primary/20 dark:hover:bg-primary/30 dark:text-primary"
                      }`}
                      data-testid={`button-audio-play-${message.id}`}
                    >
                      {isAudioPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <input
                        type="range"
                        min="0"
                        max={audioDuration || 0}
                        value={audioCurrentTime}
                        onChange={handleAudioSeek}
                        className={`w-full h-1 rounded-full appearance-none cursor-pointer ${
                          isOwnMessage
                            ? "bg-primary-foreground/20 dark:bg-primary-foreground/20"
                            : "bg-muted dark:bg-muted"
                        }`}
                        style={{
                          background: `linear-gradient(to right, ${
                            isOwnMessage 
                              ? 'hsl(var(--primary-foreground) / 0.6)' 
                              : 'hsl(var(--primary))'
                          } 0%, ${
                            isOwnMessage 
                              ? 'hsl(var(--primary-foreground) / 0.6)' 
                              : 'hsl(var(--primary))'
                          } ${(audioCurrentTime / (audioDuration || 1)) * 100}%, ${
                            isOwnMessage 
                              ? 'hsl(var(--primary-foreground) / 0.2)' 
                              : 'hsl(var(--muted))'
                          } ${(audioCurrentTime / (audioDuration || 1)) * 100}%, ${
                            isOwnMessage 
                              ? 'hsl(var(--primary-foreground) / 0.2)' 
                              : 'hsl(var(--muted))'
                          } 100%)`
                        }}
                      />
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-xs ${
                          isOwnMessage 
                            ? "text-primary-foreground/70 dark:text-primary-foreground/70" 
                            : "text-muted-foreground dark:text-muted-foreground"
                        }`}>
                          {formatTime(audioCurrentTime)}
                        </span>
                        <span className={`text-xs ${
                          isOwnMessage 
                            ? "text-primary-foreground/70 dark:text-primary-foreground/70" 
                            : "text-muted-foreground dark:text-muted-foreground"
                        }`}>
                          {formatTime(audioDuration)}
                        </span>
                      </div>
                    </div>
                    <audio
                      ref={audioRef}
                      src={message.mediaUrl}
                      onTimeUpdate={handleAudioTimeUpdate}
                      onLoadedMetadata={handleAudioLoadedMetadata}
                      onEnded={handleAudioEnded}
                      onError={() => setMediaLoadError(true)}
                      className="hidden"
                      data-testid={`audio-media-${message.id}`}
                    />
                  </div>
                ) : (
                  <a
                    href={message.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 dark:bg-muted/40 hover:bg-muted/60 dark:hover:bg-muted/60 transition-colors"
                    data-testid={`link-media-${message.id}`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Paperclip className="w-5 h-5 text-primary dark:text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-sm">
                        {message.fileName || "Attachment"}
                      </p>
                      {message.fileSize && (
                        <p className={`text-xs ${
                          isOwnMessage 
                            ? "text-primary-foreground/60 dark:text-primary-foreground/60" 
                            : "text-muted-foreground dark:text-muted-foreground"
                        }`}>
                          {(message.fileSize / 1024).toFixed(1)} KB
                        </p>
                      )}
                    </div>
                  </a>
                )}
              </div>
            )}

            {message.mediaDeleted && message.mediaUrl && (
              <div className="mb-2 px-4 py-2">
                <p className="text-sm italic opacity-60" data-testid="text-deleted-media">
                  [Media deleted]
                </p>
              </div>
            )}

            {message.text && (
              <div className={message.mediaUrl && !message.mediaDeleted ? "px-4 pb-2" : ""}>
                <p className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                  isOwnMessage ? "text-black dark:text-black font-medium" : ""
                }`} data-testid="text-message-content">
                  {message.text}
                </p>
              </div>
            )}

            <div className={`flex items-center gap-1.5 mt-1 ${
              message.mediaUrl && !message.text ? "px-3 pb-2" : ""
            } ${isOwnMessage ? "justify-end" : "justify-start"}`}>
              <span className={`text-xs ${
                isOwnMessage 
                  ? "text-primary-foreground/70 dark:text-primary-foreground/70" 
                  : "text-muted-foreground dark:text-muted-foreground"
              }`}>
                {formatMessageTime(message.timestamp)}
              </span>
              {getReadReceiptIcon()}
            </div>
          </div>
        </div>
      </div>

      {imagePreview && message.mediaUrl && !mediaLoadError && (
        <div
          className="fixed inset-0 z-50 bg-background/95 dark:bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 fade-in"
          onClick={() => setImagePreview(false)}
        >
          <img
            src={message.mediaUrl}
            alt="Full size preview"
            className="max-w-full max-h-full rounded-lg shadow-2xl scale-in"
            onError={() => setMediaLoadError(true)}
            data-testid="img-preview"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 bg-background dark:bg-background border-2 border-border dark:border-border shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              setImagePreview(false);
            }}
            data-testid="button-close-preview"
          >
            <X className="h-5 w-5 text-[#CDFF00]" />
          </Button>
        </div>
      )}
    </>
  );
}
