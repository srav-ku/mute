import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UsernameDialogProps {
  open: boolean;
  onSetUsername: (username: string) => void;
}

export function UsernameDialog({ open, onSetUsername }: UsernameDialogProps) {
  const [username, setUsername] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSetUsername(username.trim());
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" hideClose>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Welcome to Chat!</DialogTitle>
            <DialogDescription>
              Please enter a username to start chatting
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoFocus
                data-testid="input-username"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              disabled={!username.trim()}
              data-testid="button-set-username"
            >
              Start Chatting
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
