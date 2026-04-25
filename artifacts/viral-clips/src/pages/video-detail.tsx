import { Layout } from "@/components/Layout";
import { useParams, useLocation, Link } from "wouter";
import { formatDuration, buildObjectUrl, shortenFileName } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressPanel } from "@/components/ProgressPanel";
import { ClipCard } from "@/components/ClipCard";
import { ChevronLeft, Trash2, RefreshCw, AlertCircle, FileText, ChevronDown, ChevronUp, Flame, PlayCircle, ExternalLink, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  apiGetVideo, apiGetTranscript, apiDeleteVideo, apiReprocessVideo, apiCreateManualClip, apiStopVideo,
  type VideoDetail,
} from "@/lib/apiClient";

export default function VideoDetail() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [data, setData] = useState<VideoDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [transcript, setTranscript] = useState<{ segments: { start: number; end: number; text: string }[] } | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual clip state
  const [manualStart, setManualStart] = useState("0");
  const [manualEnd, setManualEnd] = useState("30");
  const [manualCaption, setManualCaption] = useState("");
  const [isGeneratingManual, setIsGeneratingManual] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const d = await apiGetVideo(id);
      setData(d);
      
      // If we don't have transcript yet, or video just finished, fetch it
      if (!transcript && (d.video.status === "done" || d.video.status === "processing")) {
        apiGetTranscript(id).then(t => {
          if (t && t.segments.length > 0) setTranscript(t);
        }).catch(() => {});
      }

      const status = d.job.status;
      if (status === "queued" || status === "processing") {
        pollRef.current = setTimeout(fetchData, 2500);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [id, transcript]);

  useEffect(() => {
    fetchData();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [fetchData]);

  const handleDelete = async () => {
    try {
      await apiDeleteVideo(id);
      toast({ title: "Video deleted successfully" });
      setLocation("/videos");
    } catch {
      toast({ title: "Failed to delete video", variant: "destructive" });
    }
  };

  const handleReprocess = async () => {
    try {
      await apiReprocessVideo(id);
      toast({ title: "Reprocessing started" });
      if (pollRef.current) clearTimeout(pollRef.current);
      setIsLoading(true);
      setTranscript(null);
      fetchData();
    } catch {
      toast({ title: "Failed to start reprocessing", variant: "destructive" });
    }
  };

  const handleStop = async () => {
    try {
      await apiStopVideo(id);
      toast({ title: "Cancellation requested" });
      fetchData();
    } catch {
      toast({ title: "Failed to stop processing", variant: "destructive" });
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

  if (!data) return <Layout><div className="p-12 text-center text-white/50">Video not found</div></Layout>;

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
            <h1 className="text-2xl font-bold tracking-tight" title={video.fileName}>{shortenFileName(video.fileName, 40)}</h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={video.status} />
              {video.durationSeconds && (
                <span className="text-sm text-white/50">{formatDuration(video.durationSeconds)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(isFailed || isDone) && (
              <button onClick={handleReprocess} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 gap-2">
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
                  <AlertDialogDescription>Are you sure? This will permanently delete the video and all extracted clips.</AlertDialogDescription>
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
          {/* Main Video Player - Always Visible */}
          <div className="glass-card rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video relative group">
            <video 
              ref={videoRef}
              src={buildObjectUrl(video.objectPath)} 
              controls 
              className="w-full h-full object-contain"
            />
            {isProcessing && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                <div className="bg-black/60 rounded-full px-4 py-2 border border-white/10 flex items-center gap-3">
                  <PlayCircle className="w-5 h-5 text-primary animate-pulse" />
                  <span className="text-sm font-medium uppercase tracking-wider">Previewing while processing</span>
                </div>
              </div>
            )}
          </div>


          {/* Quick Actions Bar */}
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => {
                if (videoRef.current) {
                  const canvas = document.createElement("canvas");
                  canvas.width = videoRef.current.videoWidth;
                  canvas.height = videoRef.current.videoHeight;
                  const ctx = canvas.getContext("2d");
                  ctx?.drawImage(videoRef.current, 0, 0);
                  const link = document.createElement("a");
                  link.download = `frame-${videoRef.current.currentTime.toFixed(2)}.jpg`;
                  link.href = canvas.toDataURL("image/jpeg");
                  link.click();
                  toast({ title: "Frame snapshot saved" });
                }
              }}
              className="flex-1 min-w-[150px] py-2.5 px-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
            >
              <FileText className="w-4 h-4 text-blue-400" />
              Capture Frame
            </button>
            <a 
              href={buildObjectUrl(video.objectPath)} 
              download={`${video.fileName}-audio.mp3`}
              className="flex-1 min-w-[150px] py-2.5 px-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4 text-green-400" />
              Extract Audio
            </a>
            <button 
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.requestFullscreen();
                }
              }}
              className="flex-1 min-w-[150px] py-2.5 px-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
            >
              <ExternalLink className="w-4 h-4 text-purple-400" />
              Full Screen
            </button>
          </div>


          {isFailed && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Processing Failed</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="mb-4 font-mono text-xs whitespace-pre-wrap">{job.errorMessage || "An unknown error occurred during processing."}</p>
                <button onClick={handleReprocess} className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 px-4">
                  <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                </button>
              </AlertDescription>
            </Alert>
          )}

          {isProcessing && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight">Active Processing</h2>
              <ProgressPanel job={job} />
            </div>
          )}

          {/* Manual Clipping Section - Advanced Editor Mode */}
          <div className="glass-card rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Flame className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                    Pro Video Editor
                    <Link href={`/editor/${id}`} className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full hover:bg-primary hover:text-white transition-all">
                      OPEN FULL STUDIO
                    </Link>
                  </h2>
                  <p className="text-sm text-white/50">Manual precision clipping & editing</p>
                </div>

              </div>
              <div className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-white/40">
                FRAME-ACCURATE
              </div>
            </div>

            {/* Visual Timeline Proxy - Clickable to Scrub */}
            <div 
              onClick={(e) => {
                if (video.durationSeconds) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const pct = x / rect.width;
                  seekTo(pct * video.durationSeconds);
                }
              }}
              className="relative h-12 bg-white/5 rounded-lg overflow-hidden border border-white/5 group cursor-pointer hover:border-primary/30 transition-all"
            >
              <div 
                className="absolute h-full bg-primary/20 border-x border-primary/40 transition-all duration-200"
                style={{
                  left: `${(Number(manualStart) / (video.durationSeconds || 1)) * 100}%`,
                  width: `${((Number(manualEnd) - Number(manualStart)) / (video.durationSeconds || 1)) * 100}%`
                }}
              />
              {/* Playhead */}
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none"
                style={{ left: `${(videoRef.current?.currentTime || 0) / (video.durationSeconds || 1) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-[10px] font-bold uppercase tracking-tighter bg-black/40 px-2 py-1 rounded">Click to Scrub</span>
              </div>
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Start Time</label>
                  <span className="text-xs font-mono text-primary">{formatDuration(Number(manualStart))}</span>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    step="0.1"
                    value={manualStart} 
                    onChange={(e) => setManualStart(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all text-white"
                  />
                  <button 
                    onClick={() => setManualStart((videoRef.current?.currentTime || 0).toFixed(2))}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold uppercase transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-white/60 uppercase tracking-wider">End Time</label>
                  <span className="text-xs font-mono text-primary">{formatDuration(Number(manualEnd))}</span>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    step="0.1"
                    value={manualEnd} 
                    onChange={(e) => setManualEnd(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all text-white"
                  />
                  <button 
                    onClick={() => setManualEnd((videoRef.current?.currentTime || 0).toFixed(2))}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold uppercase transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-white/60 uppercase tracking-wider">Clip Caption (Burns into video)</label>
              <input 
                type="text" 
                value={manualCaption} 
                onChange={(e) => setManualCaption(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-white"
                placeholder="Enter a punchy caption for social media..."
              />
            </div>

            <button 
              onClick={async () => {
                if (!manualCaption) {
                  toast({ title: "Please enter a caption", variant: "destructive" });
                  return;
                }
                const start = Number(manualStart);
                const end = Number(manualEnd);
                if (end <= start) {
                  toast({ title: "End time must be greater than start time", variant: "destructive" });
                  return;
                }
                setIsGeneratingManual(true);
                try {
                  await apiCreateManualClip(id, start, end, manualCaption);
                  toast({ title: "Professional clip export started" });
                  setManualCaption("");
                  fetchData();
                } catch (err: any) {
                  toast({ title: "Failed to export clip", description: err.message, variant: "destructive" });
                } finally {
                  setIsGeneratingManual(false);
                }
              }}
              disabled={isGeneratingManual}
              className="w-full py-4 px-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-xl shadow-primary/30 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isGeneratingManual ? <RefreshCw className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
              Export Custom Viral Clip
            </button>
          </div>



          {(isDone || (isProcessing && clips.length > 0)) && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Flame className="h-6 w-6 text-primary" />
                  Viral Clips Generated
                </h2>
                {isProcessing && (
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/60 animate-pulse">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Finding More...
                  </div>
                )}
              </div>
              {!clips.length ? (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-xl text-white/50">
                  No viral clips were found yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {clips.map((clip) => (
                    <ClipCard key={clip.id} clip={clip} onClickPlay={() => seekTo(clip.startSec)} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        <div className="space-y-6">
          {/* Transcript Column */}
          <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen} className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col max-h-[80vh] sticky top-24">
            <CollapsibleTrigger className="flex items-center justify-between w-full p-5 hover:bg-white/[0.02] transition-colors border-b border-white/5">
              <div className="flex items-center gap-3 font-semibold text-lg">
                <FileText className="h-5 w-5 text-primary" />
                Transcript
              </div>
              {transcriptOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="flex-1 overflow-hidden flex flex-col">
              {!transcript ? (
                <div className="p-12 text-center text-white/30 space-y-3">
                  {isProcessing ? (
                    <>
                      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-sm">Waiting for Gemini AI to finish transcription...</p>
                    </>
                  ) : (
                    <p className="text-sm">No transcript available.</p>
                  )}
                </div>
              ) : (
                <div className="p-4 overflow-y-auto scrollbar-thin space-y-1">
                  {Array.isArray(transcript.segments) && transcript.segments.map((seg, i) => (

                    <button
                      key={i}
                      onClick={() => seekTo(seg.start)}
                      className="flex items-start gap-4 w-full text-left p-2.5 rounded-xl hover:bg-white/5 transition-all group border border-transparent hover:border-white/5"
                    >
                      <span className="text-xs font-mono text-primary/80 mt-1 whitespace-nowrap bg-primary/10 px-2 py-0.5 rounded">
                        {formatDuration(seg.start)}
                      </span>
                      <span className="text-sm text-white/70 group-hover:text-white transition-colors leading-relaxed">
                        {seg.text}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </Layout>
  );
}
