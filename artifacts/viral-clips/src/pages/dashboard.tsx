import { Layout } from "@/components/Layout";
import { ClipCard } from "@/components/ClipCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDuration, formatBytes, shortenFileName } from "@/lib/format";
import { Link } from "wouter";
import { Upload, Film, Flame, CheckCircle, Activity } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { apiGetStats, apiListVideos, type StatsResponse, type VideoItem } from "@/lib/apiClient";

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);

  useEffect(() => {
    apiGetStats().then(setStats).catch(() => {}).finally(() => setStatsLoading(false));
    apiListVideos().then(setVideos).catch(() => {}).finally(() => setVideosLoading(false));
  }, []);

  const recentVideos = videos.slice(0, 5);

  return (
    <Layout>
      {/* Hero */}
      <section className="mb-12 rounded-3xl bg-gradient-primary p-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
        <div className="bg-background/95 backdrop-blur-3xl rounded-[1.4rem] p-8 md:p-12 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Find the <span className="gradient-text">viral moments</span> hiding in your long-form video.
            </h1>
            <p className="text-lg text-white/60 mb-8 max-w-xl">
              Automatically analyze speech, sentiment, and hooks to extract the highest-converting short clips for TikTok, Shorts, and Reels.
            </p>
            <Link href="/upload" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-12 px-8 py-2 w-auto gap-2">
              <Upload className="h-5 w-5" />
              Upload Video
            </Link>
          </div>
          <div className="hidden md:flex flex-col gap-4">
            <div className="w-64 h-48 rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <Flame className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div className="h-4 w-1/3 bg-white/20 rounded-full"></div>
              <div className="h-4 w-2/3 bg-white/10 rounded-full"></div>
              <div className="h-2 w-full bg-white/5 rounded-full mt-auto"></div>
              <div className="h-2 w-4/5 bg-white/5 rounded-full"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Videos", value: stats?.totalVideos ?? "-", icon: Film },
          { label: "Viral Clips Found", value: stats?.totalClips ?? "-", icon: Flame },
          { label: "Completed", value: stats?.completedVideos ?? "-", icon: CheckCircle },
          { label: "Avg Viral Score", value: stats?.averageViralScore ? Math.round(stats.averageViralScore) : "-", icon: Activity },
        ].map((stat, i) => (
          <div key={i} className="glass-card rounded-xl p-6 border border-white/5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-white/60">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-white/40" />
            </div>
            <span className="text-3xl font-bold">{statsLoading ? "..." : stat.value}</span>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Top Viral Clips</h2>
          {statsLoading ? (
            <div className="h-64 flex items-center justify-center glass-card rounded-xl border border-white/5">
              <p className="text-white/40">Loading clips...</p>
            </div>
          ) : !stats?.topClips?.length ? (
            <div className="h-64 flex flex-col items-center justify-center glass-card rounded-xl border border-white/5 text-center p-6 gap-4">
              <Flame className="w-12 h-12 text-white/20" />
              <div>
                <p className="text-lg font-medium text-white/80">No clips found yet</p>
                <p className="text-sm text-white/50">Upload a video to start generating clips</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.topClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Active Processing</h2>
            <Link href="/history" className="text-sm text-primary hover:text-primary/80">View History</Link>
          </div>
          <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
            {videosLoading ? (
              <div className="p-6 text-center text-white/40">Loading...</div>
            ) : !videos.filter(v => v.status === "processing" || v.status === "queued").length ? (
              <div className="p-12 flex flex-col items-center text-center gap-3">
                <CheckCircle className="h-8 w-8 text-white/20" />
                <div>
                  <p className="text-white/60">No active processing.</p>
                  <p className="text-white/40 text-xs mt-1">Completed projects are saved in History.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {videos.filter(v => v.status === "processing" || v.status === "queued").map((video) => (
                  <Link key={video.id} href={`/videos/${video.id}`} className="flex flex-col p-4 hover:bg-white/[0.02] transition-colors gap-2 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between gap-4 relative z-10">
                      <p className="text-sm font-medium" title={video.fileName}>{shortenFileName(video.fileName)}</p>
                      <StatusBadge status={video.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/50 relative z-10">
                      <span>{format(new Date(video.createdAt), "MMM d, h:mm a")}</span>
                      <span>&bull;</span>
                      <span>{formatBytes(video.sizeBytes)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
