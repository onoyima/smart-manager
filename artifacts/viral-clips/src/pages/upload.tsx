import { Layout } from "@/components/Layout";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Upload as UploadIcon, FileVideo, Info } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatBytes, shortenFileName } from "@/lib/format";
import { format } from "date-fns";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiUploadVideo, apiListVideos, type VideoItem } from "@/lib/apiClient";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export default function Upload() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videos, setVideos] = useState<VideoItem[]>([]);

  useEffect(() => {
    apiListVideos()
      .then(setVideos)
      .catch(() => {});
  }, []);

  const handleSelect = (file: File) => {
    if (file.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: "Max upload size is 2 GB.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    setProgress(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setProgress(0);
    try {
      const result = await apiUploadVideo(selectedFile, (pct) => setProgress(pct));
      toast({
        title: "Upload complete",
        description: "Video is now queued for processing.",
      });
      setLocation(`/videos/${result.videoId}`);
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleSelect(file);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Upload Video</h1>
          <p className="text-white/60">
            Upload a long-form video to automatically extract viral clips.
          </p>
        </div>

        <div className="glass-card rounded-2xl border border-white/10 p-8">
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-white/20 rounded-xl bg-white/[0.02] mb-6 hover:border-primary/50 transition-colors"
          >
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <UploadIcon className="h-8 w-8 text-primary" />
            </div>
            
            {previewUrl ? (
              <div className="w-full max-w-md aspect-video mb-6 rounded-xl overflow-hidden border border-white/10 bg-black relative group">
                <video src={previewUrl} className="w-full h-full object-contain" controls />
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border border-white/10 pointer-events-none">
                  Preview
                </div>
              </div>
            ) : null}

            <h3 className="text-xl font-medium mb-2" title={selectedFile?.name}>
              {selectedFile ? shortenFileName(selectedFile.name, 30) : "Drag a file or click to browse"}
            </h3>
            <p className="text-white/50 text-sm mb-6 text-center max-w-sm">
              {selectedFile
                ? `${formatBytes(selectedFile.size)} · ${selectedFile.type || "video"}`
                : "We'll analyze it instantly for the best viral clip moments."}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleSelect(file);
              }}
            />

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {selectedFile ? "Choose another" : "Browse Files"}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? `Uploading ${progress}%...` : "Start analysis"}
              </Button>
            </div>

            {isUploading && (
              <div className="w-full mt-6">
                <Progress value={progress} />
                <p className="text-xs text-white/50 mt-2 text-center">
                  Uploading {progress}%
                </p>
              </div>
            )}
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3 text-blue-200">
            <Info className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <h4 className="font-semibold mb-1 text-blue-100">Upload Constraints</h4>
              <ul className="list-disc pl-4 space-y-1 text-blue-200/80">
                <li>Supported formats: MP4, MOV, WebM</li>
                <li>Maximum file size: 2 GB</li>
                <li>For best results, upload videos between 1 and 60 minutes</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Recent Uploads</h2>
          <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
            {!videos.length ? (
              <div className="p-8 text-center text-white/40">
                <FileVideo className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p>No videos uploaded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {videos.slice(0, 5).map((video) => (
                  <Link
                    key={video.id}
                    href={`/videos/${video.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-white/[0.02] transition-colors gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                        <FileVideo className="h-5 w-5 text-white/40" />
                      </div>
                      <div>
                        <p className="font-medium truncate max-w-xs" title={video.fileName}>
                          {shortenFileName(video.fileName, 30)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-white/50 mt-1">
                          <span>
                            {format(new Date(video.createdAt), "MMM d, h:mm a")}
                          </span>
                          <span>&bull;</span>
                          <span>{formatBytes(video.sizeBytes)}</span>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={video.status} />
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
