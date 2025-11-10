import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MoreVertical, Settings, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserHeaderProps {
  username: string;
  onLogout: () => void;
}

export function UserHeader({ username, onLogout }: UserHeaderProps) {
  const [, setLocation] = useLocation();

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex items-center gap-3 p-4 border-b border-border/50">
      <Avatar className="w-10 h-10" data-testid="avatar-user">
        <AvatarFallback className="bg-primary/20 text-primary font-semibold">
          {getInitials(username)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <h3 className="font-semibold text-foreground" data-testid="text-username">
          {username}
        </h3>
        <p className="text-xs text-muted-foreground">My Account</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hover-elevate active-elevate-2"
            data-testid="button-user-menu"
          >
            <MoreVertical className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => setLocation("/profile")}
            data-testid="menu-item-profile"
          >
            <Settings className="w-4 h-4 mr-2" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onLogout}
            data-testid="menu-item-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
