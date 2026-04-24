import { Link } from "wouter";
import { Play } from "lucide-react";
import { ViralScoreRing } from "./ViralScoreRing";
import { formatDuration } from "@/lib/format";
import type { Clip } from "@workspace/api-client-react";

interface ClipCardProps {
  clip: Clip;
  onClickPlay?: () => void;
  showLink?: boolean;
}

export function ClipCard({ clip, onClickPlay, showLink = true }: ClipCardProps) {
  const CardContent = (
    <div className="glass-card rounded-xl p-5 transition-all hover:bg-white/[0.08] group relative overflow-hidden h-full flex flex-col cursor-pointer border border-white/5">
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-3 items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-bold text-sm">
            #{clip.rank}
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-white/50 font-medium uppercase tracking-wider">Viral Score</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-bold">{clip.viralScore}</span>
              <ViralScoreRing score={clip.viralScore} size={24} strokeWidth={3} showText={false} />
            </div>
          </div>
        </div>
        <div className="rounded-md bg-black/40 px-2 py-1 text-xs font-mono text-white/80">
          {formatDuration(clip.durationSec)}
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-lg font-bold leading-tight mb-2 line-clamp-3">"{clip.caption}"</h3>
        <p className="text-sm italic text-white/60 line-clamp-2 mb-4">"{clip.hookLine}"</p>
      </div>

      {onClickPlay && (
        <button 
          onClick={(e) => { e.preventDefault(); onClickPlay(); }}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/10 py-2.5 text-sm font-medium transition-colors hover:bg-white/20 hover:text-white mt-auto"
        >
          <Play className="h-4 w-4" />
          Play clip
        </button>
      )}
    </div>
  );

  if (showLink) {
    return (
      <Link href={`/clips/${clip.videoId}/${clip.id}`} className="block h-full outline-none">
        {CardContent}
      </Link>
    );
  }

  return <div className="h-full">{CardContent}</div>;
}
