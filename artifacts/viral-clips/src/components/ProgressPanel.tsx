import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import type { JobItem } from "@/lib/apiClient";

export function ProgressPanel({ job }: { job: JobItem }) {
  return (
    <div className="glass-card rounded-xl p-6 border border-white/5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <h3 className="font-medium text-white/90">Analyzing Video</h3>
        </div>
        <span className="text-sm font-medium text-white/70">{job.progressPct}%</span>
      </div>
      
      <Progress value={job.progressPct} className="h-2" />
      
      <p className="text-sm text-white/60">
        Current stage: <span className="font-medium text-white/80">{job.stage || "Initializing..."}</span>
      </p>
    </div>
  );
}
