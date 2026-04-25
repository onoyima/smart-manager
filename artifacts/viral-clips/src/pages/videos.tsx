import { Layout } from "@/components/Layout";
import { Link } from "wouter";
import { format } from "date-fns";
import { formatBytes, formatDuration, shortenFileName } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Trash2, ExternalLink, Film, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import { apiListVideos, apiDeleteVideo, type VideoItem } from "@/lib/apiClient";

export default function Videos() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchVideos = useCallback(() => {
    setIsLoading(true);
    apiListVideos()
      .then(setVideos)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteVideo(id);
      toast({ title: "Video deleted successfully" });
      fetchVideos();
    } catch {
      toast({ title: "Failed to delete video", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">All Videos</h1>
          <p className="text-white/60">Manage your uploaded videos and extracted clips.</p>
        </div>
        <Link href="/upload" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-6 gap-2">
          <Upload className="h-4 w-4" />
          Upload New
        </Link>
      </div>

      <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-white/40">Loading videos...</div>
        ) : !videos.length ? (
          <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-white/10 rounded-xl m-4">
            <Film className="h-12 w-12 text-white/20 mb-4" />
            <h3 className="text-lg font-medium mb-2 text-white/80">No videos found</h3>
            <p className="text-white/50 mb-6 max-w-sm">Upload your first video to start automatically extracting viral moments.</p>
            <Link href="/upload" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
              Go to Upload
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/[0.02] border-b border-white/5 text-white/60 uppercase text-xs tracking-wider font-medium">
                <tr>
                  <th className="px-6 py-4">Video</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Size</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {videos.map((video) => (
                  <tr key={video.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                          <Film className="h-4 w-4 text-white/40" />
                        </div>
                        <span className="font-medium" title={video.fileName}>{shortenFileName(video.fileName)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={video.status} /></td>
                    <td className="px-6 py-4 text-white/70">{formatDuration(video.durationSeconds)}</td>
                    <td className="px-6 py-4 text-white/70">{formatBytes(video.sizeBytes)}</td>
                    <td className="px-6 py-4 text-white/70 whitespace-nowrap">{format(new Date(video.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/videos/${video.id}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 text-white/60">
                          <ExternalLink className="h-4 w-4" />
                          <span className="sr-only">View</span>
                        </Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-destructive/10 hover:text-destructive h-8 w-8 text-white/60">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="glass-card border-white/10 bg-background/95 backdrop-blur-xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Video</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{video.fileName}"? This action cannot be undone and will delete all extracted clips.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-white/5 border-white/10 hover:bg-white/10 hover:text-white">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(video.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
