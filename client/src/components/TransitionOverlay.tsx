import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export function TransitionOverlay() {
  const [location, setLocation] = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [fromLanding, setFromLanding] = useState(false);
  const [landingHTML, setLandingHTML] = useState<string>("");

  useEffect(() => {
    // Listen for transition trigger
    const handleTransition = (event: Event) => {
      // Capture the landing page HTML before starting
      const landingPage = document.querySelector('[data-page="landing"]');
      if (landingPage) {
        setLandingHTML(landingPage.outerHTML);
      }
      
      // Get target route from CustomEvent or default to /register for backward compatibility
      let route = "/register";
      if (event instanceof CustomEvent && event.detail?.targetRoute) {
        route = event.detail.targetRoute;
      }
      
      setIsTransitioning(true);
      setFromLanding(true);
      
      // Navigate to target route (loads underneath)
      setTimeout(() => {
        setLocation(route);
      }, 100);
    };

    window.addEventListener('startLandingTransition', handleTransition);

    return () => {
      window.removeEventListener('startLandingTransition', handleTransition);
    };
  }, [setLocation]);

  useEffect(() => {
    // Reset after animation completes
    if (isTransitioning) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setFromLanding(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning]);

  if (!isTransitioning || !fromLanding) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Full border box that expands from corners then retracts */}
      <div 
        className="absolute"
        style={{
          top: '2rem',
          left: '2rem',
          right: '2rem',
          bottom: '2rem',
          border: '2px solid rgba(205, 255, 0, 0.2)',
          borderRadius: '0.5rem',
          clipPath: 'polygon(0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0, 0 0)',
          animation: 'expandBorder 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, retractBorder 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 3.2s forwards'
        }}
      />

      {/* Landing page blocks that fade out to reveal signup underneath */}
      {landingHTML && (
        <div 
          className="absolute inset-0"
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(8, 1fr)',
            gridTemplateRows: 'repeat(6, 1fr)',
          }}
        >
          {Array.from({ length: 48 }).map((_, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            // Diagonal wave from top-left - starts AFTER border completes (0.8s)
            const delay = 0.9 + (row + col) * 0.15;
            
            return (
              <div
                key={index}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: 1,
                  animation: `blockDisappear 0.6s ease-in-out ${delay}s forwards`,
                  transformOrigin: 'center'
                }}
              >
                {/* Each block shows a piece of the landing page */}
                <div
                  style={{
                    position: 'absolute',
                    top: `-${row * (100 / 6)}vh`,
                    left: `-${col * (100 / 8)}vw`,
                    width: '100vw',
                    height: '100vh',
                    pointerEvents: 'none'
                  }}
                  dangerouslySetInnerHTML={{ __html: landingHTML }}
                />
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes expandBorder {
          0% { 
            clip-path: polygon(
              0% 6rem, 0% 0%, 6rem 0%,
              calc(100% - 6rem) 100%, 100% 100%, 100% calc(100% - 6rem)
            );
          }
          100% { 
            clip-path: polygon(
              0% 100%, 0% 0%, 100% 0%,
              100% 0%, 100% 100%, 0% 100%
            );
          }
        }

        @keyframes retractBorder {
          0% { 
            clip-path: polygon(
              0% 100%, 0% 0%, 100% 0%,
              100% 0%, 100% 100%, 0% 100%
            );
          }
          100% { 
            clip-path: polygon(
              0% 6rem, 0% 0%, 6rem 0%,
              calc(100% - 6rem) 100%, 100% 100%, 100% calc(100% - 6rem)
            );
          }
        }

        @keyframes blockDisappear {
          0% { 
            opacity: 1;
          }
          100% { 
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
