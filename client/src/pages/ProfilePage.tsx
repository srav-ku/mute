import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const userId = localStorage.getItem("chatUserId");
  const username = localStorage.getItem("chatUsername");

  useEffect(() => {
    if (!userId || !username) {
      setLocation("/login");
    }
  }, [userId, username, setLocation]);

  const { data: user, isLoading } = useQuery<{
    id: string;
    username: string;
    recoveryCode: string;
    createdAt: number;
  }>({
    queryKey: [`/api/users/${userId}`],
    enabled: !!userId,
  });

  const handleCopyRecoveryCode = async () => {
    if (user?.recoveryCode) {
      await navigator.clipboard.writeText(user.recoveryCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Recovery code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBack = () => {
    setLocation("/");
  };

  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  if (!userId || !username) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="border-b p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            data-testid="button-back"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">Profile</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-center gap-4 space-y-0">
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
                <AvatarFallback className="text-xl sm:text-2xl">
                  {getInitials(username)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left">
                <CardTitle className="text-xl sm:text-2xl" data-testid="text-username">{username}</CardTitle>
                <CardDescription>Your profile information</CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recovery Code</CardTitle>
              <CardDescription>
                Use this code along with your password to login from any device
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-primary/10 p-4 sm:p-6 rounded-lg">
                    <p className="text-2xl sm:text-3xl font-mono font-bold tracking-wider text-center text-primary break-all" data-testid="text-recovery-code">
                      {user?.recoveryCode}
                    </p>
                  </div>
                  <Button
                    onClick={handleCopyRecoveryCode}
                    className="w-full"
                    variant="outline"
                    data-testid="button-copy-code"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Recovery Code
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-muted-foreground text-center">
                    Keep this code safe. You'll need it to access your account.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
