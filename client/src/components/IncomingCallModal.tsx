import { Phone, Video, PhoneOff, User } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { type Call } from "@shared/schema";
import { useEffect, useState } from "react";

interface IncomingCallModalProps {
  call: Call | null;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ call, onAccept, onReject }: IncomingCallModalProps) {
  const [ringTone, setRingTone] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (call && call.status === "ringing") {
      const audio = new Audio();
      audio.loop = true;
      audio.volume = 0.5;
      audio.play().catch(console.error);
      setRingTone(audio);

      return () => {
        audio.pause();
        audio.currentTime = 0;
      };
    }
  }, [call]);

  if (!call || call.status !== "ringing") return null;

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Dialog open={true}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center justify-center py-8 px-4">
          <div className="mb-6 relative">
            <Avatar className="w-24 h-24">
              <AvatarFallback className="bg-primary/20 text-primary font-semibold text-2xl">
                {getInitials(call.callerUsername)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              {call.type === "video" ? (
                <Video className="w-6 h-6 text-primary" />
              ) : (
                <Phone className="w-6 h-6 text-primary" />
              )}
            </div>
          </div>

          <h3 className="text-2xl font-bold mb-2" data-testid="text-caller-name">
            {call.callerUsername}
          </h3>
          <p className="text-muted-foreground mb-8">
            Incoming {call.type} call...
          </p>

          <div className="flex gap-4">
            <Button
              size="lg"
              variant="destructive"
              className="rounded-full w-16 h-16"
              onClick={onReject}
              data-testid="button-reject-call"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>

            <Button
              size="lg"
              className="rounded-full w-16 h-16 bg-green-500 hover:bg-green-600"
              onClick={onAccept}
              data-testid="button-accept-call"
            >
              {call.type === "video" ? (
                <Video className="w-6 h-6" />
              ) : (
                <Phone className="w-6 h-6" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
