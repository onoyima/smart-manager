import { Layout } from "@/components/Layout";
import { useGetVideo, useGetVideoTranscript, useDeleteVideo } from "@workspace/api-client-react";
import { useParams, useLocation, Link } from "wouter";
import { buildObjectUrl, formatDuration } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressPanel } from "@/components/ProgressPanel";
import { ClipCard } from "@/components/ClipCard";
import { ChevronLeft, Trash2, RefreshCw, AlertCircle, FileText, ChevronDown, ChevronUp, Flame } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function VideoDetail() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const { data, isLoading, refetch } = useGetVideo(id, {
    query: {
      refetchInterval: (query: { state: { data?: { job?: { status?: string } } } }) => {
        const status = query.state.data?.job?.status;
        if (status === "queued" || status === "processing") return 2500;
        return false;
      },
    } as never,
  });

  const { data: transcript } = useGetVideoTranscript(id, {
    query: { enabled: !!data && data.video.status === "done" } as never,
  });

  const deleteVideo = useDeleteVideo();

  const handleDelete = async () => {
    try {
      await deleteVideo.mutateAsync({ id });
      toast({ title: "Video deleted successfully" });
      setLocation("/videos");
    } catch (err) {
      toast({ 
        title: "Failed to delete video", 
        variant: "destructive" 
      });
    }
  };

  const handleReprocess = async () => {
    try {
      await fetch(`/api/videos/${id}/reprocess`, { method: "POST" });
      toast({ title: "Reprocessing started" });
      refetch();
    } catch (err) {
      toast({ 
        title: "Failed to start reprocessing", 
        variant: "destructive" 
      });
    }
  };

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  if (isLoading && !data) {
    return (
      <Layout>
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-white/10 rounded w-1/3"></div>
          <div className="h-[400px] bg-white/5 rounded-xl"></div>
        </div>
      </Layout>
    );
  }

  if (!data) return <Layout><div>Not found</div></Layout>;

  const { video, job, clips } = data;
  const isProcessing = job.status === "queued" || job.status === "processing";
  const isFailed = job.status === "failed";
  const isDone = job.status === "done";

  return (
    <Layout>
      <div className="mb-6">
        <Link href="/videos" className="inline-flex items-center text-sm font-medium text-white/60 hover:text-white transition-colors mb-4">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to videos
        </Link>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight truncate max-w-xl" title={video.fileName}>
              {video.fileName}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={video.status} />
              {video.durationSeconds && (
                <span className="text-sm text-white/50">{formatDuration(video.durationSeconds)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(isFailed || isDone) && (
              <button 
                onClick={handleReprocess}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Reprocess
              </button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground h-9 px-4 py-2 gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="glass-card border-white/10 bg-background/95 backdrop-blur-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Video</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this video? This will permanently delete the video file and all extracted clips.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/5 border-white/10">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-xl overflow-hidden border border-white/5 bg-black">
            <video 
              ref={videoRef}
              src={buildObjectUrl(video.objectPath)} 
              controls 
              preload="metadata"
              className="w-full aspect-video object-contain"
            />
          </div>

          {isFailed && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Processing Failed</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="mb-4">{job.errorMessage || "An unknown error occurred during processing."}</p>
                <button 
                  onClick={handleReprocess}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 px-4"
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                </button>
              </AlertDescription>
            </Alert>
          )}

          {isProcessing && (
            <ProgressPanel job={job} />
          )}

          {isDone && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Flame className="h-6 w-6 text-primary" />
                Viral Clips Generated
              </h2>
              
              {!clips.length ? (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-xl text-white/50">
                  No viral clips were found in this video.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {clips.map(clip => (
                    <ClipCard 
                      key={clip.id} 
                      clip={clip} 
                      onClickPlay={() => seekTo(clip.startSec)} 
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          {transcript && (
            <Collapsible 
              open={transcriptOpen} 
              onOpenChange={setTranscriptOpen}
              className="glass-card rounded-xl border border-white/5 sticky top-24"
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="h-4 w-4 text-white/60" />
                  Transcript
                </div>
                {transcriptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 pt-0 h-[500px] overflow-y-auto scrollbar-thin space-y-2">
                  {transcript.segments.map((seg, i) => (
                    <button
                      key={i}
                      onClick={() => seekTo(seg.start)}
                      className="flex items-start gap-3 w-full text-left p-2 rounded-lg hover:bg-white/5 transition-colors group"
                    >
                      <span className="text-xs font-mono text-primary/70 mt-1 whitespace-nowrap">
                        {formatDuration(seg.start)}
                      </span>
                      <span className="text-sm text-white/80 group-hover:text-white transition-colors leading-relaxed">
                        {seg.text}
                      </span>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </Layout>
  );
}
