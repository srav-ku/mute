import { useRef, useState } from "react";
import { Send, Paperclip, Mic, StopCircle, X, Trash2, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { getCloudinaryConfig } from "@/lib/env";
import { Progress } from "@/components/ui/progress";

const messageFormSchema = z.object({
  text: z.string(),
});

interface ChatInputProps {
  onSendMessage: (text: string, mediaUrl?: string, mediaType?: string) => Promise<void>;
  username: string;
  onTyping?: () => void;
  placeholder?: string;
}

export function ChatInput({ onSendMessage, username, onTyping, placeholder = "Type a message..." }: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [isSendingAudio, setIsSendingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof messageFormSchema>>({
    resolver: zodResolver(messageFormSchema),
    defaultValues: {
      text: "",
    },
  });

  const handleSubmit = async (values: z.infer<typeof messageFormSchema>) => {
    if (!values.text.trim() && !selectedFile) return;

    try {
      if (selectedFile) {
        setIsUploading(true);
        setUploadProgress(0);
        setUploadingFileName(selectedFile.name);

        const config = await getCloudinaryConfig();
        
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("upload_preset", config.uploadPreset);

        const data = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percentComplete);
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status === 200) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error("Upload failed"));
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Upload failed")));
          xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

          xhr.open("POST", `https://api.cloudinary.com/v1_1/${config.cloudName}/upload`);
          xhr.send(formData);
        });

        let mediaType: "image" | "video" | "audio" | "file" = "file";
        if (data.resource_type === "image") {
          mediaType = "image";
        } else if (data.resource_type === "video") {
          mediaType = "video";
        } else if (data.resource_type === "raw" && selectedFile.type.startsWith("audio/")) {
          mediaType = "audio";
        }

        await onSendMessage(values.text.trim(), data.secure_url, mediaType);
        
        setSelectedFile(null);
        setMediaPreview(null);
        setIsUploading(false);
        setUploadProgress(0);
        setUploadingFileName("");
      } else {
        await onSendMessage(values.text.trim());
      }
      
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      setIsUploading(false);
      setUploadProgress(0);
      setUploadingFileName("");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 100MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setMediaPreview(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
        }
        
        setRecordedAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record voice messages.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const sendVoiceMessage = async () => {
    if (!recordedAudio) return;
    
    setIsSendingAudio(true);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadingFileName("Voice message");
    
    try {
      const config = await getCloudinaryConfig();
      
      const formData = new FormData();
      formData.append("file", recordedAudio, "voice-message.webm");
      formData.append("upload_preset", config.uploadPreset);
      formData.append("resource_type", "video");

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error("Upload failed"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

        xhr.open("POST", `https://api.cloudinary.com/v1_1/${config.cloudName}/upload`);
        xhr.send(formData);
      });
      
      const currentText = form.getValues("text");
      await onSendMessage(currentText.trim() || "", data.secure_url, "audio");
      form.reset();
      
      setRecordedAudio(null);
      setRecordingTime(0);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload voice message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSendingAudio(false);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadingFileName("");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isSubmitting = form.formState.isSubmitting;

  if (isUploading) {
    return (
      <div className="w-full bg-card dark:bg-card border-t border-border dark:border-border p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-primary dark:text-primary animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground dark:text-foreground truncate">
                Sending {uploadingFileName}
              </p>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                {uploadProgress}% complete
              </p>
            </div>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      </div>
    );
  }

  if (recordedAudio) {
    return (
      <div className="w-full bg-card dark:bg-card border-t border-border dark:border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-full bg-secondary/60 dark:bg-secondary/60 border border-border/40 dark:border-border/40">
            <div className="w-10 h-10 rounded-full bg-primary/20 dark:bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Mic className="h-5 w-5 text-primary dark:text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground dark:text-foreground">Voice Message</p>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">{formatTime(recordingTime)}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            disabled={isSendingAudio}
            className="hover-elevate active-elevate-2 flex-shrink-0 h-10 w-10"
            data-testid="button-cancel-voice"
            aria-label="Cancel voice message"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="default"
            size="icon"
            onClick={sendVoiceMessage}
            disabled={isSendingAudio}
            className="flex-shrink-0 h-10 w-10"
            data-testid="button-send-voice"
            aria-label="Send voice message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="w-full bg-card dark:bg-card border-t border-border dark:border-border p-3 sm:p-4"
      >
        {selectedFile && mediaPreview && (
          <div className="mb-3 relative inline-block" data-testid="media-preview-container">
            <div className="relative rounded-md overflow-hidden border-2 border-primary/30 dark:border-primary/30">
              {selectedFile.type.startsWith("image/") ? (
                <img 
                  src={mediaPreview} 
                  alt="Selected media" 
                  className="max-h-24 sm:max-h-32 max-w-full sm:max-w-xs object-cover"
                  data-testid="preview-image"
                />
              ) : selectedFile.type.startsWith("video/") ? (
                <video 
                  src={mediaPreview} 
                  className="max-h-24 sm:max-h-32 max-w-full sm:max-w-xs"
                  data-testid="preview-video"
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={removeSelectedFile}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-[#CDFF00] hover:bg-[#CDFF00]/90 text-black"
                data-testid="button-remove-media"
                aria-label="Remove media"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*"
            className="hidden"
            data-testid="input-file"
          />
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting || isRecording || isUploading || !!selectedFile}
            className="hover-elevate active-elevate-2 flex-shrink-0 h-9 w-9"
            data-testid="button-upload-media"
            aria-label="Upload media"
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          <FormField
            control={form.control}
            name="text"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <input
                    {...field}
                    type="text"
                    placeholder={placeholder}
                    disabled={isSubmitting || isRecording || isUploading}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    onChange={(e) => {
                      field.onChange(e);
                      if (onTyping) {
                        onTyping();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        form.handleSubmit(handleSubmit)();
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-full bg-secondary/60 dark:bg-secondary/60 border border-border/40 dark:border-border/40 text-foreground dark:text-foreground placeholder:text-muted-foreground dark:placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 dark:focus:border-primary/50 focus:bg-secondary/80 dark:focus:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    data-testid="input-message"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {isRecording ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-destructive dark:text-destructive font-medium animate-pulse" data-testid="text-recording-time">
                {formatTime(recordingTime)}
              </span>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={stopRecording}
                className="flex-shrink-0 h-9 w-9"
                data-testid="button-stop-recording"
                aria-label="Stop recording"
              >
                <StopCircle className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={startRecording}
                disabled={isSubmitting}
                className="hover-elevate active-elevate-2 flex-shrink-0 h-9 w-9"
                data-testid="button-record-voice"
                aria-label="Record voice message"
              >
                <Mic className="h-5 w-5" />
              </Button>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                disabled={isSubmitting || (!form.watch("text")?.trim() && !selectedFile)}
                className="hover-elevate active-elevate-2 flex-shrink-0 h-9 w-9"
                data-testid="button-send"
                aria-label="Send message"
              >
                <Send className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </form>
    </Form>
  );
}
