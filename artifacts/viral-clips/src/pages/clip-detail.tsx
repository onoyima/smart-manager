import { Layout } from "@/components/Layout";
import { useGetVideo } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { buildObjectUrl, formatDuration } from "@/lib/format";
import { ChevronLeft, Copy, Play, Check, Flame } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ViralScoreRing } from "@/components/ViralScoreRing";

export default function ClipDetail() {
  const params = useParams();
  const videoId = params.videoId as string;
  const clipId = params.clipId as string;
  const { toast } = useToast();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const { data, isLoading } = useGetVideo(videoId);

  const clip = data?.clips?.find(c => c.id === clipId);

  // Auto-seek and loop logic
  useEffect(() => {
    if (!videoRef.current || !clip) return;
    
    const video = videoRef.current;
    video.currentTime = clip.startSec;
    
    const handleTimeUpdate = () => {
      if (video.currentTime >= clip.endSec) {
        video.currentTime = clip.startSec;
      }
    };
    
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [clip]);

  if (isLoading) {
    return <Layout><div className="animate-pulse p-12 text-center text-white/50">Loading clip...</div></Layout>;
  }

  if (!data || !clip) {
    return <Layout><div className="p-12 text-center">Clip not found</div></Layout>;
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(`${clip.caption}\n\n${clip.hookLine}`);
    setCopiedCaption(true);
    toast({ title: "Caption copied to clipboard" });
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const scores = [
    { label: "Hook", value: clip.hookScore },
    { label: "Energy", value: clip.energyScore },
    { label: "Sentiment", value: clip.sentimentScore },
    { label: "Keyword", value: clip.keywordDensity },
    { label: "Pacing", value: clip.speechRate },
  ];

  return (
    <Layout>
      <div className="mb-6">
        <Link href={`/videos/${videoId}`} className="inline-flex items-center text-sm font-medium text-white/60 hover:text-white transition-colors mb-4">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to video
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        {/* Left Column: Video */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl overflow-hidden border border-white/10 bg-black aspect-[9/16] relative max-h-[80vh] flex items-center justify-center mx-auto">
            <video 
              ref={videoRef}
              src={buildObjectUrl(data.video.objectPath)}
              controls
              autoPlay
              muted
              className="w-full h-full object-cover"
            />
            {/* Title overlay simulation */}
            <div className="absolute top-8 left-0 right-0 px-6 text-center pointer-events-none">
              <span className="bg-black/60 backdrop-blur-md text-white font-bold text-xl px-4 py-2 rounded-lg border border-white/10 inline-block drop-shadow-md">
                {clip.hookLine}
              </span>
            </div>
          </div>
          
          <div className="flex gap-4 max-w-sm mx-auto">
            <button 
              onClick={handleCopyLink}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-12 gap-2"
            >
              {copiedLink ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copiedLink ? "Copied!" : "Copy Link"}
            </button>
            <button 
              onClick={handleCopyCaption}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-12 gap-2"
            >
              {copiedCaption ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedCaption ? "Copied!" : "Copy Text"}
            </button>
          </div>
        </div>

        {/* Right Column: Analysis */}
        <div className="space-y-8 py-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium mb-4">
              <Flame className="h-4 w-4 text-primary" />
              Rank #{clip.rank} Viral Clip
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 leading-tight">
              "{clip.caption}"
            </h1>
            <p className="text-xl text-white/60 italic border-l-4 border-primary pl-4">
              {clip.hookLine}
            </p>
          </div>

          <div className="glass-card p-8 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center gap-8">
            <div className="flex flex-col items-center">
              <span className="text-sm text-white/50 uppercase tracking-widest font-semibold mb-2">Viral Score</span>
              <ViralScoreRing score={clip.viralScore} size={120} strokeWidth={8} className="text-4xl" />
            </div>
            
            <div className="flex-1 w-full space-y-4">
              {scores.map(s => (
                <div key={s.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">{s.label}</span>
                    <span className="font-medium">{s.value}/100</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-primary rounded-full" 
                      style={{ width: `${s.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2">AI Rationale</h3>
            <p className="text-white/70 leading-relaxed text-sm">
              {clip.rationale}
            </p>
          </div>
          
          <div className="space-y-3">
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2">Transcript Section</h3>
            <p className="text-white/60 text-sm font-mono bg-black/50 p-4 rounded-lg border border-white/5">
              {clip.transcriptText}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
