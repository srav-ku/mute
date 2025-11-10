import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { X, FileText } from "lucide-react";
import { type Message } from "@shared/schema";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ContactDetailsProps {
  username: string;
  isOnline: boolean;
  messages: Message[];
  onClose: () => void;
}

export function ContactDetails({ username, isOnline, messages, onClose }: ContactDetailsProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  const mediaMessages = messages.filter(msg => msg.mediaUrl && !msg.deleted);
  const imageMessages = mediaMessages.filter(msg => msg.mediaType === "image");
  const fileMessages = mediaMessages.filter(msg => msg.mediaType !== "image");

  return (
    <div className="w-80 border-l border-border/50 bg-sidebar flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="font-semibold text-foreground" data-testid="text-contact-details-title">
          Contact detail
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hover-elevate active-elevate-2"
          data-testid="button-close-contact-details"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col items-center py-6 px-4 border-b border-border/50">
          <Avatar className="w-24 h-24 mb-3" data-testid="avatar-contact">
            <AvatarFallback className="bg-primary/20 text-primary font-semibold text-2xl">
              {getInitials(username)}
            </AvatarFallback>
          </Avatar>
          <h3 className="text-lg font-semibold text-foreground mb-1" data-testid="text-contact-name">
            {username}
          </h3>
          <p className={`text-sm ${isOnline ? 'text-green-500' : 'text-muted-foreground'}`} data-testid="text-contact-status">
            {isOnline ? "Online" : "Offline"}
          </p>
        </div>

        {imageMessages.length > 0 && (
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-foreground" data-testid="text-media-title">
                Media
              </h4>
              <span className="text-xs text-muted-foreground">
                {imageMessages.length} {imageMessages.length === 1 ? 'picture' : 'pictures'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {imageMessages.slice(0, 6).map((msg, index) => (
                <button
                  key={msg.id}
                  onClick={() => setSelectedImage(msg.mediaUrl || null)}
                  className="aspect-square rounded-lg overflow-hidden hover-elevate active-elevate-2 bg-muted"
                  data-testid={`button-media-${index}`}
                >
                  <img
                    src={msg.mediaUrl}
                    alt="Media"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
              {imageMessages.length > 6 && (
                <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                  <span className="text-lg font-semibold text-foreground">
                    +{imageMessages.length - 6}
                  </span>
                </div>
              )}
            </div>
            {imageMessages.length > 6 && (
              <Button
                variant="ghost"
                className="w-full mt-2 text-primary hover-elevate active-elevate-2"
                data-testid="button-view-all-media"
              >
                View all
              </Button>
            )}
          </div>
        )}

        {fileMessages.length > 0 && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-foreground" data-testid="text-files-title">
                Files
              </h4>
              <span className="text-xs text-muted-foreground">
                {fileMessages.length} {fileMessages.length === 1 ? 'file' : 'files'}
              </span>
            </div>
            <div className="space-y-2">
              {fileMessages.slice(0, 3).map((msg, index) => {
                const fileName = msg.mediaUrl?.split('/').pop() || 'File';
                const fileSize = msg.text || '';
                
                return (
                  <a
                    key={msg.id}
                    href={msg.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2 rounded-lg hover-elevate active-elevate-2 bg-sidebar-accent"
                    data-testid={`link-file-${index}`}
                  >
                    <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">{fileSize}</p>
                    </div>
                  </a>
                );
              })}
            </div>
            {fileMessages.length > 3 && (
              <Button
                variant="ghost"
                className="w-full mt-2 text-primary hover-elevate active-elevate-2"
                data-testid="button-view-all-files"
              >
                View all
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {selectedImage && (
            <img src={selectedImage} alt="Full size" className="w-full h-auto" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
