import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { type GroupWithDetails } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  Loader2, 
  Plus,
  Users as UsersIcon,
  ArrowLeft
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function GroupsListPage() {
  const [, setLocation] = useLocation();
  const [currentTab, setCurrentTab] = useState<"my-groups" | "discover">("my-groups");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const { toast } = useToast();

  const userId = localStorage.getItem("chatUserId");

  const { data: myGroups = [], isLoading: loadingMyGroups } = useQuery<GroupWithDetails[]>({
    queryKey: ["/api/groups/my"],
    enabled: !!userId && currentTab === "my-groups",
  });

  const { data: allGroups = [], isLoading: loadingAllGroups } = useQuery<GroupWithDetails[]>({
    queryKey: ["/api/groups", searchQuery],
    queryFn: async () => {
      const url = searchQuery ? `/api/groups?q=${encodeURIComponent(searchQuery)}` : "/api/groups";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch groups");
      return response.json();
    },
    enabled: currentTab === "discover",
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return await apiRequest("POST", "/api/groups", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Group created successfully",
      });
      setShowCreateDialog(false);
      setGroupName("");
      setGroupDescription("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create group",
        variant: "destructive",
      });
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return await apiRequest("POST", `/api/groups/${groupId}/join`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: "Success",
        description: "Joined group successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join group",
        variant: "destructive",
      });
    },
  });

  const handleCreateGroup = () => {
    if (!groupName.trim()) {
      toast({
        title: "Error",
        description: "Group name is required",
        variant: "destructive",
      });
      return;
    }
    createGroupMutation.mutate({
      name: groupName.trim(),
      description: groupDescription.trim() || undefined,
    });
  };

  const handleGroupClick = (groupId: string) => {
    setLocation(`/group/${groupId}`);
  };

  const handleJoinGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    joinGroupMutation.mutate(groupId);
  };

  const displayGroups = currentTab === "my-groups" ? myGroups : allGroups;
  const isLoading = currentTab === "my-groups" ? loadingMyGroups : loadingAllGroups;

  return (
    <div className="h-screen flex bg-background dark:bg-background">
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border dark:border-border flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            className="hover-elevate active-elevate-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="font-semibold text-foreground dark:text-foreground text-lg">Groups</h2>
        </div>

        <div className="flex border-b border-border dark:border-border">
          <button
            onClick={() => setCurrentTab("my-groups")}
            className={`flex-1 py-3 text-sm font-medium hover-elevate active-elevate-2 ${
              currentTab === "my-groups"
                ? "text-primary dark:text-primary border-b-2 border-primary dark:border-primary"
                : "text-muted-foreground dark:text-muted-foreground"
            }`}
            data-testid="tab-my-groups"
          >
            My Groups
          </button>
          <button
            onClick={() => setCurrentTab("discover")}
            className={`flex-1 py-3 text-sm font-medium hover-elevate active-elevate-2 ${
              currentTab === "discover"
                ? "text-primary dark:text-primary border-b-2 border-primary dark:border-primary"
                : "text-muted-foreground dark:text-muted-foreground"
            }`}
            data-testid="tab-discover"
          >
            Discover
          </button>
        </div>

        <div className="p-3 border-b border-border dark:border-border flex items-center gap-2">
          {currentTab === "discover" && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background dark:bg-background border-border/50 dark:border-border/50 text-sm h-9 rounded-md"
                data-testid="input-search-groups"
              />
            </div>
          )}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button
                variant="default"
                className="hover-elevate active-elevate-2"
                data-testid="button-create-group"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Group</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="group-name">Group Name *</Label>
                  <Input
                    id="group-name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="mt-1"
                    data-testid="input-group-name"
                  />
                </div>
                <div>
                  <Label htmlFor="group-description">Description (Optional)</Label>
                  <Textarea
                    id="group-description"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Enter group description"
                    className="mt-1 resize-none"
                    rows={3}
                    data-testid="input-group-description"
                  />
                </div>
                <Button
                  onClick={handleCreateGroup}
                  className="w-full hover-elevate active-elevate-2"
                  disabled={createGroupMutation.isPending}
                  data-testid="button-submit-group"
                >
                  {createGroupMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Group"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : displayGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <UsersIcon className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {currentTab === "my-groups" ? "You haven't joined any groups yet" : "No groups found"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {currentTab === "my-groups" ? "Discover and join groups to get started" : "Try searching for different groups"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayGroups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => handleGroupClick(group.id)}
                  className="p-4 border border-border dark:border-border rounded-md hover-elevate active-elevate-2 cursor-pointer"
                  data-testid={`group-${group.id}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary/20 text-primary font-medium">
                        {group.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground dark:text-foreground truncate">
                        {group.name}
                      </h3>
                      <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                        {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                      </p>
                    </div>
                  </div>
                  {group.description && (
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground line-clamp-2 mb-3">
                      {group.description}
                    </p>
                  )}
                  {currentTab === "discover" && !group.isMember && (
                    <Button
                      onClick={(e) => handleJoinGroup(group.id, e)}
                      variant="outline"
                      size="sm"
                      className="w-full hover-elevate active-elevate-2"
                      disabled={joinGroupMutation.isPending}
                      data-testid={`button-join-${group.id}`}
                    >
                      {joinGroupMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3 mr-2" />
                          Join Group
                        </>
                      )}
                    </Button>
                  )}
                  {group.isCreator && (
                    <div className="mt-2 text-xs text-primary dark:text-primary">Creator</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
