import { Link } from "wouter";
import { Sparkles, LayoutDashboard, Video, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navLinks = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/videos", label: "Videos", icon: Video },
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
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 py-8">
        {children}
      </main>
    </div>
  );
}
