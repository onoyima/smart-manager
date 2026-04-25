import { Layout } from "@/components/Layout";
import { useState, useEffect } from "react";
import { apiListVideos, apiListClips, type VideoItem, type ClipItem } from "@/lib/apiClient";
import { format } from "date-fns";
import { formatDuration, formatBytes, shortenFileName, buildClipUrl } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "wouter";
import { Film, Flame, History as HistoryIcon, Download, ExternalLink, Clock, HardDrive } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ViralScoreRing } from "@/components/ViralScoreRing";

export default function History() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [vData, cData] = await Promise.all([apiListVideos(), apiListClips()]);
        setVideos(vData);
        setClips(cData);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Layout>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <HistoryIcon className="h-8 w-8 text-primary" />
            History
          </h1>
          <p className="text-white/60">Your complete archive of uploads and viral clips.</p>
        </div>
      </div>

      <Tabs defaultValue="uploads" className="w-full">
        <TabsList className="bg-white/5 border border-white/10 p-1 mb-8">
          <TabsTrigger value="uploads" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-8">
            <Film className="h-4 w-4 mr-2" />
            Uploads ({videos.length})
          </TabsTrigger>
          <TabsTrigger value="clips" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-8">
            <Flame className="h-4 w-4 mr-2" />
            Clips ({clips.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uploads" className="mt-0">
          <div className="glass-card rounded-2xl border border-white/10 overflow-hidden bg-black/20 backdrop-blur-sm">
            {isLoading ? (
              <div className="p-20 text-center text-white/40 animate-pulse">Loading upload history...</div>
            ) : videos.length === 0 ? (
              <EmptyState icon={Film} title="No uploads yet" description="Start by uploading a video to see your history here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-widest font-black text-white/40 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4">Filename</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Stats</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {videos.map((v) => (
                      <tr key={v.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5">
                              <Film className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-bold text-sm" title={v.fileName}>{shortenFileName(v.fileName)}</p>
                              <p className="text-[10px] text-white/40 uppercase font-black">{v.contentType.split("/")[1]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5"><StatusBadge status={v.status} /></td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4 text-[10px] font-bold text-white/60">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDuration(v.durationSeconds)}</span>
                            <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {formatBytes(v.sizeBytes)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-xs text-white/50">{format(new Date(v.createdAt), "MMM d, HH:mm")}</td>
                        <td className="px-6 py-5 text-right">
                          <Link href={`/videos/${v.id}`} className="p-2 hover:bg-primary/20 text-white/60 hover:text-primary rounded-lg transition-all inline-block">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="clips" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full p-20 text-center text-white/40 animate-pulse">Loading clip history...</div>
            ) : clips.length === 0 ? (
              <div className="col-span-full">
                <EmptyState icon={Flame} title="No clips found" description="Clips will appear here once your videos are processed." />
              </div>
            ) : (
              clips.map((c) => (
                <div key={c.id} className="glass-card group rounded-2xl border border-white/5 bg-black/20 overflow-hidden hover:border-primary/50 transition-all hover:translate-y-[-4px] shadow-xl hover:shadow-primary/10">
                  <div className="aspect-[9/16] relative bg-black flex items-center justify-center">
                    <ViralScoreRing score={c.viralScore} size={48} strokeWidth={4} className="absolute top-4 right-4 z-10 text-xs shadow-2xl" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/clips/${c.videoId}/${c.id}`} className="bg-white text-black p-3 rounded-full shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                        <ExternalLink className="h-5 w-5" />
                      </Link>
                    </div>
                    {/* Placeholder for real thumbnail */}
                    <Flame className="h-12 w-12 text-primary/20" />
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">Viral Score {c.viralScore}</span>
                      <span className="text-[10px] font-mono text-white/40">{formatDuration(c.durationSec)}</span>
                    </div>
                    <h3 className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors">"{c.caption}"</h3>
                    <div className="flex gap-2 pt-2">
                      <Link href={`/clips/${c.videoId}/${c.id}`} className="flex-1 text-center bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase py-2 rounded-lg border border-white/5 transition-all">Details</Link>
                      {c.clipUrl && (
                        <a 
                          href={buildClipUrl(c.videoId, c.id)} 
                          download 
                          className="p-2 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-lg border border-primary/20 transition-all"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-20 text-center">
      <div className="h-16 w-16 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 mb-6 group-hover:scale-110 transition-transform">
        <Icon className="h-8 w-8 text-white/20" />
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-white/40 max-w-xs text-sm leading-relaxed">{description}</p>
    </div>
  );
}
