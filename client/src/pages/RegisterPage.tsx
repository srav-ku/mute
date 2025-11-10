import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { setUserPresence } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, ArrowRight, Sparkles, UserCircle } from "lucide-react";

const registerFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(20, "Username must be less than 20 characters"),
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  password: z.string().min(8, "Password must be at least 8 characters").max(15, "Password must be at most 15 characters"),
});

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof registerFormSchema>>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      name: "",
      password: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { username: string; name: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return await response.json();
    },
    onSuccess: async (data) => {
      localStorage.setItem("chatUserId", data.user.id);
      localStorage.setItem("chatUsername", data.user.username);
      sessionStorage.setItem("authToken", `${data.user.id}-${Date.now()}`);
      
      await setUserPresence(data.user.id, data.user.username, true).catch(console.error);
      
      toast({
        title: "Account created!",
        description: `Welcome, ${data.user.name}!`,
      });
      
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.message || "Username might already be taken",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (values: z.infer<typeof registerFormSchema>) => {
    registerMutation.mutate(values);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a]">
      {/* Animated background gradients - matching landing page */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(205,255,0,0.08),transparent_40%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(205,255,0,0.06),transparent_40%)]" />
      
      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' /%3E%3C/svg%3E")`
        }}
      />

      {/* Decorative corner accents */}
      <div className="absolute top-8 left-8 w-24 h-24 border-l-2 border-t-2 border-[#CDFF00]/20 rounded-tl-lg" />
      <div className="absolute bottom-8 right-8 w-24 h-24 border-r-2 border-b-2 border-[#CDFF00]/20 rounded-br-lg" />
      
      <div className="w-full max-w-md relative z-10 fade-in px-4">
        <div className="text-center mb-6 sm:mb-8 slide-up">
          <h1 
            className="text-3xl sm:text-4xl font-bold mb-2"
            style={{
              color: "#CDFF00",
              textShadow: "0 0 30px rgba(205, 255, 0, 0.3)"
            }}
          >
            Join Mute
          </h1>
          <p className="text-white/70 text-sm sm:text-base">
            Connect with Others
          </p>
        </div>

        <div 
          className="backdrop-blur-sm rounded-md p-6 sm:p-8 slide-up" 
          style={{ 
            animationDelay: '0.1s',
            background: "rgba(10, 10, 10, 0.6)",
            borderColor: "rgba(205, 255, 0, 0.2)",
            border: "1px solid rgba(205, 255, 0, 0.2)"
          }}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel 
                      className="text-sm font-medium"
                      style={{ color: "rgba(255, 255, 255, 0.9)" }}
                    >
                      Username
                    </FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User 
                            className="w-4 h-4 transition-colors" 
                            style={{ color: "rgba(205, 255, 0, 0.5)" }}
                          />
                        </div>
                        <Input
                          {...field}
                          placeholder="Choose a unique username"
                          className="pl-10 h-11 transition-all duration-200 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CDFF00] focus-visible:ring-offset-0 focus-visible:border-[#CDFF00]"
                          style={{
                            background: "rgba(0, 0, 0, 0.3)",
                            borderColor: "rgba(205, 255, 0, 0.2)",
                            color: "rgba(255, 255, 255, 0.9)"
                          }}
                          data-testid="input-username"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel 
                      className="text-sm font-medium"
                      style={{ color: "rgba(255, 255, 255, 0.9)" }}
                    >
                      Display Name
                    </FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <UserCircle 
                            className="w-4 h-4 transition-colors" 
                            style={{ color: "rgba(205, 255, 0, 0.5)" }}
                          />
                        </div>
                        <Input
                          {...field}
                          placeholder="Your name"
                          className="pl-10 h-11 transition-all duration-200 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CDFF00] focus-visible:ring-offset-0 focus-visible:border-[#CDFF00]"
                          style={{
                            background: "rgba(0, 0, 0, 0.3)",
                            borderColor: "rgba(205, 255, 0, 0.2)",
                            color: "rgba(255, 255, 255, 0.9)"
                          }}
                          data-testid="input-name"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel 
                      className="text-sm font-medium"
                      style={{ color: "rgba(255, 255, 255, 0.9)" }}
                    >
                      Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock 
                            className="w-4 h-4 transition-colors" 
                            style={{ color: "rgba(205, 255, 0, 0.5)" }}
                          />
                        </div>
                        <Input
                          {...field}
                          type="password"
                          placeholder="8-15 characters"
                          className="pl-10 h-11 transition-all duration-200 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CDFF00] focus-visible:ring-offset-0 focus-visible:border-[#CDFF00]"
                          style={{
                            background: "rgba(0, 0, 0, 0.3)",
                            borderColor: "rgba(205, 255, 0, 0.2)",
                            color: "rgba(255, 255, 255, 0.9)"
                          }}
                          data-testid="input-password"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11 font-semibold rounded-md transition-all duration-200 group no-default-hover-elevate no-default-active-elevate border-transparent focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{
                  background: "#CDFF00",
                  color: "#000000"
                }}
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Join Mute
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-2 group-hover:scale-110 group-active:translate-x-6 group-active:opacity-70 transition-all duration-500 ease-out" />
                  </span>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
              Already have an account?{" "}
              <button
                onClick={() => setLocation("/login")}
                className="font-medium transition-colors inline-flex items-center gap-1"
                style={{ color: "#CDFF00" }}
                data-testid="link-login"
              >
                Sign in
                <ArrowRight className="w-3 h-3" />
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
