import { cn } from "@/lib/utils";

interface ViralScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showText?: boolean;
}

export function ViralScoreRing({ 
  score, 
  size = 64, 
  strokeWidth = 6, 
  className,
  showText = true
}: ViralScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  let colorClass = "text-red-500";
  if (score >= 70) colorClass = "text-green-500";
  else if (score >= 50) colorClass = "text-amber-500";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          className="text-white/10"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={colorClass}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
        />
      </svg>
      {showText && (
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-lg font-bold">{score}</span>
        </div>
      )}
    </div>
  );
}
