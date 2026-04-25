import { Link } from "wouter";
import { Sparkles, LayoutDashboard, Video, Upload, History as HistoryIcon, Scissors, Clapperboard } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navLinks = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/history", label: "History", icon: HistoryIcon },
    { href: "/projects", label: "Projects", icon: Clapperboard },
    { href: "/upload", label: "Upload", icon: Upload },
  ];



  return (
    <div className="min-h-screen bg-background text-foreground dark selection:bg-primary/30">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary shadow-lg shadow-primary/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight gradient-text">ViralCut</span>
          </Link>
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-6">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2 text-sm font-medium transition-colors hover:text-white",
                      isActive ? "text-white" : "text-white/60"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="flex items-center gap-4 ml-4 pl-4 border-l border-white/10">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-white/60">{user.email}</span>
                  <span className="text-xs font-bold uppercase text-primary">{user.plan} PLAN</span>
                </div>
                <button
                  onClick={logout}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-md"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 py-8">
        {children}
      </main>
    </div>
  );
}
