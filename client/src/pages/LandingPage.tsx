import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageCircle, Users, Lock, UserX, ShieldCheck } from "lucide-react";

const features = [
  {
    id: "realtime",
    icon: MessageCircle,
    title: "Real-time",
    description: "Instant messaging with zero delays",
    position: { top: "10%", right: "8%" }
  },
  {
    id: "groups",
    icon: Users,
    title: "Groups",
    description: "Create Groups and have fun together",
    position: { bottom: "15%", left: "5%" }
  },
  {
    id: "encrypted",
    icon: Lock,
    title: "Encrypted",
    description: "End-to-end security guaranteed",
    position: { top: "60%", right: "5%" }
  },
  {
    id: "anonymous",
    icon: ShieldCheck,
    title: "Anonymous",
    description: "Mute identity with username. No Phone, Mail needed. Complete Privacy",
    position: { top: "8%", left: "12%" }
  }
];

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [mousePositions, setMousePositions] = useState<Record<string, {x: number, y: number, isHovering: boolean}>>({});
  const [isConnectHovered, setIsConnectHovered] = useState(false);
  const [isReconnectHovered, setIsReconnectHovered] = useState(false);

  useEffect(() => {
    const userId = localStorage.getItem("chatUserId");
    if (userId) {
      setLocation("/");
    }
  }, [setLocation]);

  const triggerLandingTransition = (targetRoute: string) => {
    // Start the transition animation first with target route
    window.dispatchEvent(new CustomEvent('startLandingTransition', { 
      detail: { targetRoute } 
    }));
    
    // Don't navigate until animation is done
    // The animation will handle navigation timing
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, featureId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePositions(prev => ({ ...prev, [featureId]: { x, y, isHovering: true } }));
  };

  const handleMouseLeave = (featureId: string) => {
    setMousePositions(prev => ({ ...prev, [featureId]: { x: 0, y: 0, isHovering: false } }));
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-[#0a0a0a] relative" data-page="landing">
      {/* Animated background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(205,255,0,0.08),transparent_40%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(205,255,0,0.06),transparent_40%)]" />
      
      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' /%3E%3C/svg%3E")`
        }}
      />

      {/* Center Content */}
      <div className="relative h-full flex items-center justify-center px-4 sm:px-6 md:px-8">
        <div className="text-center z-10 space-y-6 sm:space-y-8">
          <div className="space-y-4 sm:space-y-6">
            <h1 
              className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter"
              style={{ 
                color: "#CDFF00",
                textShadow: "0 0 60px rgba(205, 255, 0, 0.4)"
              }}
              data-testid="text-app-name"
            >
              Mute
            </h1>
            
            <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-white/70 max-w-2xl mx-auto font-light px-4">
              Chat freely.
              <br />
              fade Quietly.
            </p>
          </div>

          <div className="space-y-4 sm:space-y-6 pt-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
              <Button
                size="lg"
                onClick={() => triggerLandingTransition('/register')}
                onMouseEnter={() => setIsConnectHovered(true)}
                onMouseLeave={() => setIsConnectHovered(false)}
                className="bg-[#CDFF00] text-black font-semibold border-0 no-default-hover-elevate no-default-active-elevate relative overflow-hidden w-full sm:w-auto"
                style={{
                  background: "#CDFF00"
                }}
                data-testid="button-signup"
              >
                <span className="relative inline-block transition-all duration-300 ease-out"
                  style={{
                    transform: isConnectHovered ? 'translateY(-100%)' : 'translateY(0)',
                    opacity: isConnectHovered ? 0 : 1
                  }}
                >
                  Connect
                </span>
                <span className="absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out"
                  style={{
                    transform: isConnectHovered ? 'translateY(0)' : 'translateY(100%)',
                    opacity: isConnectHovered ? 1 : 0
                  }}
                >
                  Sign Up
                </span>
              </Button>
              
              <Button
                size="lg"
                variant="outline"
                onClick={() => triggerLandingTransition('/login')}
                onMouseEnter={() => setIsReconnectHovered(true)}
                onMouseLeave={() => setIsReconnectHovered(false)}
                className="border-[#CDFF00]/30 text-[#CDFF00] relative overflow-hidden w-full sm:w-auto"
                data-testid="button-login"
              >
                <span className="relative inline-block transition-all duration-300 ease-out"
                  style={{
                    transform: isReconnectHovered ? 'translateY(-100%)' : 'translateY(0)',
                    opacity: isReconnectHovered ? 0 : 1
                  }}
                >
                  ReConnect
                </span>
                <span className="absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out"
                  style={{
                    transform: isReconnectHovered ? 'translateY(0)' : 'translateY(100%)',
                    opacity: isReconnectHovered ? 1 : 0
                  }}
                >
                  Login
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Feature Cards - Only Visible on Hover */}
      {features.map((feature) => {
        const Icon = feature.icon;
        const mousePos = mousePositions[feature.id] || { x: 0, y: 0, isHovering: false };
        
        return (
          <div
            key={feature.id}
            className="absolute hidden lg:block"
            style={feature.position}
            data-testid={`feature-${feature.id}`}
          >
            {/* Hover trigger area - larger invisible zone */}
            <div 
              className="absolute -inset-20 cursor-default"
              onMouseMove={(e) => handleMouseMove(e, feature.id)}
              onMouseLeave={() => handleMouseLeave(feature.id)}
            />
            
            {/* Feature Card with Cursor-based Reveal */}
            <div 
              className="relative w-64 pointer-events-none overflow-hidden rounded-md"
              style={{
                WebkitMaskImage: mousePos.isHovering 
                  ? `radial-gradient(circle 120px at ${mousePos.x}px ${mousePos.y}px, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.5) 60%, transparent 100%)`
                  : 'radial-gradient(circle 0px at 50% 50%, rgba(0, 0, 0, 0) 0%, transparent 100%)',
                maskImage: mousePos.isHovering 
                  ? `radial-gradient(circle 120px at ${mousePos.x}px ${mousePos.y}px, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.5) 60%, transparent 100%)`
                  : 'radial-gradient(circle 0px at 50% 50%, rgba(0, 0, 0, 0) 0%, transparent 100%)',
                transition: 'all 0.1s ease-out'
              }}
            >
              <Card 
                className="relative backdrop-blur-sm border"
                style={{
                  background: "rgba(10, 10, 10, 0.6)",
                  borderColor: "rgba(205, 255, 0, 0.2)"
                }}
              >
                <div className="p-6 space-y-4 relative">
                  {/* Icon with glow */}
                  <div className="relative">
                    <div 
                      className="absolute inset-0 blur-xl"
                      style={{
                        background: "radial-gradient(circle, rgba(205,255,0,0.3) 0%, transparent 70%)",
                        opacity: 0.5
                      }}
                    />
                    <div 
                      className="relative w-14 h-14 rounded-full flex items-center justify-center"
                      style={{
                        background: "rgba(205, 255, 0, 0.1)",
                        border: "2px solid rgba(205, 255, 0, 0.3)"
                      }}
                    >
                      <Icon 
                        className="w-7 h-7" 
                        style={{ color: "rgba(205, 255, 0, 0.8)" }} 
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <h3 
                      className="text-xl font-bold"
                      style={{
                        color: "rgba(205, 255, 0, 0.95)",
                        textShadow: "0 0 12px rgba(205, 255, 0, 0.4)"
                      }}
                    >
                      {feature.title}
                    </h3>
                    <p 
                      className="text-sm"
                      style={{
                        color: "rgba(255, 255, 255, 0.8)"
                      }}
                    >
                      {feature.description}
                    </p>
                  </div>
                </div>
                
                {/* Glow effect at cursor position */}
                {mousePos.isHovering && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle 100px at ${mousePos.x}px ${mousePos.y}px, rgba(205, 255, 0, 0.15) 0%, transparent 70%)`,
                      transition: 'opacity 0.2s ease-out'
                    }}
                  />
                )}
              </Card>
            </div>
          </div>
        );
      })}

      {/* Decorative corner accents */}
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 w-16 h-16 sm:w-24 sm:h-24 border-l-2 border-t-2 border-[#CDFF00]/20 rounded-tl-lg" />
      <div className="absolute bottom-4 right-4 sm:bottom-8 sm:right-8 w-16 h-16 sm:w-24 sm:h-24 border-r-2 border-b-2 border-[#CDFF00]/20 rounded-br-lg" />

    </div>
  );
}
