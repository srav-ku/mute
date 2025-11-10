import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogOut, Trash2, UserCircle, User, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SettingsViewProps {
  userId: string;
  username: string;
  onLogout: () => void;
}

const updateNameSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
});

export function SettingsView({ userId, username, onLogout }: SettingsViewProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const { toast } = useToast();

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  const { data: user, isLoading } = useQuery<{
    id: string;
    username: string;
    name: string;
    createdAt: number;
  }>({
    queryKey: [`/api/users/${userId}`],
    enabled: !!userId,
  });

  const form = useForm<z.infer<typeof updateNameSchema>>({
    resolver: zodResolver(updateNameSchema),
    defaultValues: {
      name: "",
    },
  });

  // Update form when user data loads
  useEffect(() => {
    if (user?.name) {
      form.reset({ name: user.name });
    }
  }, [user?.name, form]);

  const updateNameMutation = useMutation({
    mutationFn: async (data: z.infer<typeof updateNameSchema>) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}`, data);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}`] });
      setIsEditingName(false);
      toast({
        title: "Name updated",
        description: `Your display name has been updated to ${data.name}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update name",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/users/${userId}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted",
      });
      onLogout();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate();
    setShowDeleteDialog(false);
  };

  const handleLogout = () => {
    onLogout();
    setShowLogoutDialog(false);
  };

  const handleCancelEdit = () => {
    form.reset({ name: user?.name || "" });
    setIsEditingName(false);
  };

  const handleSubmitName = (values: z.infer<typeof updateNameSchema>) => {
    updateNameMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-y-auto custom-scrollbar">
      <div className="p-6 space-y-4 max-w-md">
        <h1 className="text-xl font-semibold text-foreground" data-testid="text-settings-title">
          Settings
        </h1>

        <Card data-testid="card-profile" className="border-border/50">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3 px-4 pt-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/20 text-primary text-base font-semibold">
                {getInitials(user?.name || username)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-base truncate" data-testid="text-profile-name">
                {user?.name}
              </CardTitle>
              <CardDescription className="text-xs">Your profile information</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            <div className="flex items-center gap-3 py-2">
              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-sm font-medium truncate" data-testid="text-username">
                  {user?.username}
                </p>
              </div>
            </div>

            <div className="h-px bg-border/50" />

            <div className="flex items-center gap-3 py-2">
              <UserCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Display Name</p>
                {!isEditingName ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate" data-testid="text-display-name">
                      {user?.name}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditingName(true)}
                      data-testid="button-edit-name"
                      className="flex-shrink-0"
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmitName)} className="space-y-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Your display name"
                                data-testid="input-edit-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={updateNameMutation.isPending}
                          data-testid="button-save-name"
                        >
                          {updateNameMutation.isPending ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Save
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={updateNameMutation.isPending}
                          data-testid="button-cancel-edit"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-account-actions" className="border-border/50">
          <CardHeader className="px-4 pt-4 pb-3">
            <CardTitle className="text-base">Account Actions</CardTitle>
            <CardDescription className="text-xs">Manage your account settings and data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            <Button
              variant="outline"
              className="w-full border-[#CDFF00]/30 text-[#CDFF00]"
              onClick={() => setShowLogoutDialog(true)}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
            <Button
              className="w-full bg-[#CDFF00] text-black font-semibold border-0 no-default-hover-elevate no-default-active-elevate hover:bg-[#CDFF00]/90"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteAccountMutation.isPending}
              data-testid="button-delete-account"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete Account"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logout Confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout? You will need to login again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-logout">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              data-testid="button-confirm-logout"
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account
              and remove all your data including messages, conversations, and call history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
