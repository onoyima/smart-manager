import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  switch (status.toLowerCase()) {
    case "done":
      return (
        <Badge variant="outline" className={cn("bg-green-500/10 text-green-500 border-green-500/20 gap-1.5", className)}>
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="outline" className={cn("bg-blue-500/10 text-blue-400 border-blue-500/20 gap-1.5", className)}>
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </Badge>
      );
    case "queued":
    case "pending":
      return (
        <Badge variant="outline" className={cn("bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1.5", className)}>
          <Clock className="h-3 w-3" />
          Queued
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className={cn("bg-red-500/10 text-red-500 border-red-500/20 gap-1.5", className)}>
          <AlertCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={cn("bg-white/5 text-white/70 border-white/10 gap-1.5", className)}>
          {status}
        </Badge>
      );
  }
}
