import { Layout } from "@/components/Layout";
import { useParams, useLocation, Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { formatDuration } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { 
  ChevronLeft, Play, Pause, Scissors, Type, Square, 
  Layers, Download, RefreshCw, Flame, Monitor, Smartphone,
  Plus, Image as ImageIcon, Video as VideoIcon, Trash2, FolderPlus,
  Music, AlignCenter, Volume2, VolumeX, SplitSquareVertical
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { set, get } from "idb-keyval";

type MediaType = "image" | "video" | "audio" | "text";
interface MediaAsset {
  id: string;
  type: MediaType;
  url: string;
  name: string;
  content?: string;
  nativeDuration?: number; // actual duration in seconds for video/audio
}

interface TimelineItem {
  id: string;
  assetId: string;
  trackIndex: number; // 0: Main, 1: Overlay, 2: Text, 3: Audio
  startAt: number;
  duration: number;
  mediaOffset: number; // where in the source media this segment starts (seconds)
  animation?: "none" | "fade" | "slide";
  muted?: boolean;
}

export default function Editor() {
  const params = useParams();
  const projectId = (params as any).projectId || "default";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(60);
  const [projectName, setProjectName] = useState("Untitled Project");
  
  // Editor State
  const [activeTab, setActiveTab] = useState<"media" | "text" | "settings">("media");
  const [mediaPool, setMediaPool] = useState<MediaAsset[]>([]);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [range, setRange] = useState<[number, number]>([0, 30]);
  const [textContent, setTextContent] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [isExporting, setIsExporting] = useState(false);

  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const mediaRefs = useRef<{ [key: string]: HTMLMediaElement | null }>({});

  const [draggedItem, setDraggedItem] = useState<TimelineItem | null>(null);
  const [draggedPoolAsset, setDraggedPoolAsset] = useState<MediaAsset | null>(null);
  const [dropTargetTrack, setDropTargetTrack] = useState<number | null>(null);
  const [resizing, setResizing] = useState<{ itemId: string; startX: number; startDuration: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);

  // Load Project from IDB
  useEffect(() => {
    const loadProject = async () => {
      setIsLoading(true);
      try {
        const projectData = await get(`project_${projectId}`);
        if (projectData) {
          if (projectData.name) setProjectName(projectData.name);
          const loadedMediaPool = await Promise.all(
            projectData.mediaPool.map(async (asset: any) => {
              if (asset.type !== "text") {
                const file = await get(`file_${asset.id}`);
                if (file) {
                  return { ...asset, url: URL.createObjectURL(file as Blob) };
                }
              }
              return asset;
            })
          );
          setMediaPool(loadedMediaPool.filter(a => a.url || a.type === "text"));
          setTimelineItems(projectData.timelineItems || []);
          setAspectRatio(projectData.aspectRatio || "9:16");
        }
      } catch (err) {
        console.error("Failed to load project", err);
      }
      setIsLoading(false);
      hasLoadedRef.current = true;
    };
    loadProject();
  }, [projectId]);

  // Auto Save Project
  useEffect(() => {
    if (!hasLoadedRef.current || isLoading) return;
    const saveProject = async () => {
      const projectData = {
        mediaPool: mediaPool.map(a => ({ ...a, url: "" })),
        timelineItems,
        aspectRatio,
        name: projectName
      };
      await set(`project_${projectId}`, projectData);
      // Update meta for Projects page listing
      const existing = await get(`project_meta_${projectId}`);
      await set(`project_meta_${projectId}`, {
        id: projectId,
        name: projectName,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aspectRatio,
        clipCount: timelineItems.length
      });
    };
    saveProject();
  }, [mediaPool, timelineItems, aspectRatio, projectId, projectName, isLoading]);

  // Dynamic Duration
  useEffect(() => {
    const maxTime = timelineItems.reduce((max, item) => Math.max(max, item.startAt + item.duration), 0);
    setDuration(Math.max(60, maxTime + 10));
  }, [timelineItems]);

  // Playback Loop
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      const loop = (time: number) => {
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        setCurrentTime(prev => {
          const next = prev + delta;
          if (next >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      animationFrameRef.current = requestAnimationFrame(loop);
      
      // Play all media
      Object.values(mediaRefs.current).forEach(el => {
        if (el) el.play().catch(()=>{});
      });
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      Object.values(mediaRefs.current).forEach(el => {
        if (el) el.pause();
      });
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, duration]);

  // Sync Media Elements
  useEffect(() => {
    const activeItems = timelineItems.filter(
      item => currentTime >= item.startAt && currentTime <= item.startAt + item.duration
    );
    
    // Only pause elements that are no longer active
    Object.entries(mediaRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const isActive = activeItems.some(i => i.id === id);
      if (!isActive && !el.paused) {
        el.pause();
      }
    });

    // Sync active elements
    activeItems.forEach(item => {
      const el = mediaRefs.current[item.id];
      if (el) {
        // mediaOffset tracks where in the source file this segment starts.
        // For the original clip it is 0; for split segments it equals the split point.
        const expectedTime = (currentTime - item.startAt) + (item.mediaOffset ?? 0);
        if (Math.abs(el.currentTime - expectedTime) > 0.2) {
          el.currentTime = expectedTime;
        }
        if (isPlaying && el.paused) {
          el.play().catch(()=>{});
        }
      }
    });
  }, [currentTime, timelineItems, isPlaying]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const handleSeek = (val: number[]) => {
    setCurrentTime(val[0]);
  };

  const handleSplit = () => {
    if (!selectedItemId) {
      toast({ title: "Select a clip to split", variant: "destructive" });
      return;
    }
    const item = timelineItems.find(i => i.id === selectedItemId);
    if (!item) return;
    
    if (currentTime > item.startAt && currentTime < item.startAt + item.duration) {
      const firstHalf = currentTime - item.startAt;    // duration of the first segment
      const secondHalf = item.duration - firstHalf;    // duration of the second segment

      // The second segment must continue from where the first left off in the source file
      const secondMediaOffset = (item.mediaOffset ?? 0) + firstHalf;

      const newItem: TimelineItem = {
        ...item,
        id: Math.random().toString(36).substring(7),
        startAt: currentTime,       // placed right after the first half on the timeline
        duration: secondHalf,
        mediaOffset: secondMediaOffset  // starts from the split point in the source media
      };
      setTimelineItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, duration: firstHalf } : i).concat(newItem)
      );
      setSelectedItemId(newItem.id);
      toast({ title: "Clip split successfully" });
    } else {
      toast({ title: "Playhead must be over the selected clip", variant: "destructive" });
    }
  };

  const handleDelete = () => {
    if (!selectedItemId) {
      toast({ title: "Select a clip to delete", variant: "destructive" });
      return;
    }
    setTimelineItems(prev => prev.filter(i => i.id !== selectedItemId));
    setSelectedItemId(null);
  };

  const handleExtractAudio = async () => {
    if (!selectedItemId) return;
    const item = timelineItems.find(i => i.id === selectedItemId);
    if (!item) return;
    const asset = mediaPool.find(a => a.id === item.assetId);
    if (!asset || asset.type !== "video") return;

    const newId = Math.random().toString(36).substring(7);
    const file = await get(`file_${asset.id}`);
    if (file) await set(`file_${newId}`, file);

    const audioAsset: MediaAsset = {
      id: newId,
      type: "audio",
      url: asset.url,
      name: `Audio: ${asset.name}`
    };
    
    setMediaPool(prev => [...prev, audioAsset]);
    
    setTimelineItems(prev => [
      ...prev.map(i => i.id === item.id ? { ...i, muted: true } : i),
      {
        id: Math.random().toString(36).substring(7),
        assetId: audioAsset.id,
        trackIndex: 3, // Audio track
        startAt: item.startAt,
        duration: item.duration
      }
    ]);
    toast({ title: "Audio extracted" });
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "Backspace":
        case "Delete":
          e.preventDefault();
          handleDelete();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, isPlaying, selectedItemId, handleDelete]);

  const handleImportMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);

      // Helper: probe actual duration from a media file via temporary element
      const probeDuration = (url: string, type: MediaType): Promise<number> =>
        new Promise(resolve => {
          if (type === "image" || type === "text") { resolve(5); return; }
          const el = type === "video"
            ? document.createElement("video")
            : document.createElement("audio");
          el.preload = "metadata";
          el.src = url;
          el.onloadedmetadata = () => {
            const d = isFinite(el.duration) && el.duration > 0 ? el.duration : 10;
            el.src = ""; // release
            resolve(d);
          };
          el.onerror = () => resolve(10);
        });

      const newAssets: MediaAsset[] = await Promise.all(files.map(async file => {
        let type: MediaType = "image";
        if (file.type.startsWith("video")) type = "video";
        if (file.type.startsWith("audio")) type = "audio";

        const id = Math.random().toString(36).substring(7);
        await set(`file_${id}`, file);

        const objectUrl = URL.createObjectURL(file);
        const nativeDuration = await probeDuration(objectUrl, type);

        return {
          id,
          type,
          url: objectUrl,
          name: file.name,
          nativeDuration
        };
      }));
      setMediaPool(prev => [...prev, ...newAssets]);
      toast({ title: `${newAssets.length} file(s) imported` });
      setActiveTab("media");
    }
  };

  const createTextAsset = () => {
    if (!textContent.trim()) return;
    const asset: MediaAsset = {
      id: Math.random().toString(36).substring(7),
      type: "text",
      url: "",
      name: `Text: ${textContent.slice(0, 10)}...`,
      content: textContent
    };
    setMediaPool(prev => [...prev, asset]);
    addToTimeline(asset, 2); // Add to text track
    setTextContent("");
  };

  const addToTimeline = (asset: MediaAsset, trackIndex: number = 0) => {
    // Use the probed native duration; fall back to sensible defaults
    const defaultDuration =
      asset.type === "image" ? 5
      : asset.type === "text" ? 3
      : (asset.nativeDuration && asset.nativeDuration > 0 ? asset.nativeDuration : 10);
    setTimelineItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        assetId: asset.id,
        trackIndex,
        startAt: currentTime,
        duration: defaultDuration,
        mediaOffset: 0  // fresh clip always starts at the beginning of the source media
      }
    ]);
    toast({ title: `Added to timeline (${defaultDuration.toFixed(1)}s)` });
  };

  const handleExport = async () => {
    toast({ title: "Export Warning", description: "Standalone NLE export is a local preview.", variant: "destructive" });
    setIsExporting(true);
    try {
      await new Promise(r => setTimeout(r, 2000));
      toast({ title: "Project Saved", description: "Your project was successfully saved." });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, item: TimelineItem) => {
    setDraggedItem(item);
    setDraggedPoolAsset(null);
    setSelectedItemId(item.id);
    setActiveTab("settings");
    e.dataTransfer.effectAllowed = "move";
  };

  const handlePoolDragStart = (e: React.DragEvent, asset: MediaAsset) => {
    setDraggedPoolAsset(asset);
    setDraggedItem(null);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDrop = (e: React.DragEvent, trackIndex: number) => {
    e.preventDefault();
    setDropTargetTrack(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, offsetX / rect.width);
    const dropTime = percentage * duration;

    if (draggedPoolAsset) {
      // Drop from media pool — create a new timeline item
      const dur = draggedPoolAsset.type === "image" ? 5
        : draggedPoolAsset.type === "text" ? 3
        : (draggedPoolAsset.nativeDuration && draggedPoolAsset.nativeDuration > 0 ? draggedPoolAsset.nativeDuration : 10);
      const newItem: TimelineItem = {
        id: Math.random().toString(36).substring(7),
        assetId: draggedPoolAsset.id,
        trackIndex,
        startAt: Math.max(0, dropTime),
        duration: dur,
        mediaOffset: 0  // fresh clip always starts from the beginning of the source media
      };
      setTimelineItems(prev => [...prev, newItem]);
      setSelectedItemId(newItem.id);
      setActiveTab("settings");
      toast({ title: `Added to timeline (${dur.toFixed(1)}s)` });
      setDraggedPoolAsset(null);
    } else if (draggedItem) {
      // Move existing clip to new position / track
      setTimelineItems(prev => prev.map(i =>
        i.id === draggedItem.id ? { ...i, trackIndex, startAt: Math.max(0, dropTime) } : i
      ));
      setDraggedItem(null);
    }
  };

  const handleResizeStart = (e: React.MouseEvent, item: TimelineItem) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({ itemId: item.id, startX: e.clientX, startDuration: item.duration });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const trackWidth = timelineRef.current.getBoundingClientRect().width;
      const pxPerSec = trackWidth / duration;
      const deltaSec = (e.clientX - resizing.startX) / pxPerSec;
      const newDuration = Math.max(0.5, resizing.startDuration + deltaSec);
      setTimelineItems(prev => prev.map(i =>
        i.id === resizing.itemId ? { ...i, duration: newDuration } : i
      ));
    };
    const onMouseUp = () => setResizing(null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing, duration]);

  const activeItems = timelineItems.filter(
    item => currentTime >= item.startAt && currentTime <= item.startAt + item.duration
  );
  
  const mainItem = activeItems.find(i => i.trackIndex === 0);
  const mainAsset = mainItem ? mediaPool.find(a => a.id === mainItem.assetId) : null;
  const overlayItems = activeItems.filter(i => i.trackIndex === 1);
  const textItems = activeItems.filter(i => i.trackIndex === 2);
  const audioItems = activeItems.filter(i => i.trackIndex === 3);

  const selectedItem = timelineItems.find(i => i.id === selectedItemId);
  const selectedAsset = selectedItem ? mediaPool.find(a => a.id === selectedItem.assetId) : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
        <RefreshCw className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-white/50 text-sm">Loading Project...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-primary/30">
      {/* Hidden Audio Players */}
      <div className="hidden">
        {timelineItems.filter(i => {
           const a = mediaPool.find(x => x.id === i.assetId);
           return a?.type === "audio" || (a?.type === "video" && i.muted);
        }).map(item => {
           const asset = mediaPool.find(a => a.id === item.assetId);
           if (!asset) return null;
           if (asset.type === "video" && !item.muted) return null;
           return <audio key={item.id} ref={(el) => { mediaRefs.current[item.id] = el; }} src={asset.url} preload="auto" muted={item.muted} />;
        })}
      </div>

      <header className="h-14 border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/projects" className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-white/60 hover:text-white">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            className="bg-transparent border-none outline-none text-sm font-bold w-48 hover:bg-white/5 focus:bg-white/10 rounded px-2 py-1 transition-colors placeholder-white/20"
            placeholder="Untitled Project"
            title="Click to rename project"
          />
          <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold">auto-saved</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} disabled={isExporting} className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2">
            {isExporting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Export
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-16 border-r border-white/5 bg-black/20 flex flex-col items-center py-4 gap-4">
          <button onClick={() => setActiveTab("media")} className={`p-3 rounded-xl transition-all ${activeTab === "media" ? "bg-white/10 text-white" : "text-white/40"}`}>
            <FolderPlus className="h-5 w-5" />
          </button>
          <button onClick={() => setActiveTab("text")} className={`p-3 rounded-xl transition-all ${activeTab === "text" ? "bg-white/10 text-white" : "text-white/40"}`}>
            <Type className="h-5 w-5" />
          </button>
          <button onClick={() => setActiveTab("settings")} className={`p-3 rounded-xl transition-all ${activeTab === "settings" ? "bg-white/10 text-white" : "text-white/40"}`}>
            <Layers className="h-5 w-5" />
          </button>
        </aside>

        <aside className="w-72 border-r border-white/5 bg-black/40 flex flex-col">
          {activeTab === "media" && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider">Media Pool</span>
                <input type="file" ref={fileInputRef} onChange={handleImportMedia} className="hidden" accept="image/*,video/*,audio/*" multiple />
                <button onClick={() => fileInputRef.current?.click()} className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Import
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2 content-start">
                {mediaPool.filter(a => a.type !== "text").map(asset => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => handlePoolDragStart(e, asset)}
                    className="relative group aspect-square bg-black/40 rounded-lg overflow-hidden border border-white/5 cursor-grab active:cursor-grabbing"
                  >
                    {asset.type === "image" && <img src={asset.url} className="w-full h-full object-cover" />}
                    {asset.type === "video" && (
                      <video
                        src={asset.url}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onMouseEnter={e => e.currentTarget.play()}
                        onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                      />
                    )}
                    {asset.type === "audio" && (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10 text-primary gap-2 p-2">
                        <Music className="h-8 w-8" />
                        <span className="text-[8px] text-center truncate w-full">{asset.name}</span>
                        <audio
                          src={asset.url}
                          preload="none"
                          onMouseEnter={e => e.currentTarget.play()}
                          onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        />
                      </div>
                    )}
                    {/* Hover overlay: add to track buttons */}
                    <div className="absolute inset-0 bg-black/75 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[8px] text-white/60 px-2 pt-2 truncate">{asset.name}</p>
                      <div className="flex-1 flex flex-col justify-center gap-1 px-2">
                        {asset.type !== "audio" && <button onClick={() => addToTimeline(asset, 0)} className="text-[9px] bg-white/10 hover:bg-emerald-600 py-1 rounded transition-colors text-center">+ Main</button>}
                        {asset.type !== "audio" && <button onClick={() => addToTimeline(asset, 1)} className="text-[9px] bg-white/10 hover:bg-blue-600 py-1 rounded transition-colors text-center">+ Overlay</button>}
                        {asset.type !== "text" && asset.type !== "image" && <button onClick={() => addToTimeline(asset, 3)} className="text-[9px] bg-white/10 hover:bg-amber-600 py-1 rounded transition-colors text-center">+ Audio</button>}
                      </div>
                      <p className="text-[7px] text-white/30 text-center pb-1">or drag to track ↓</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "text" && (
            <div className="p-4 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider block mb-2">Create Text Title</span>
              <textarea 
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-primary resize-none h-24"
                placeholder="Enter text..."
              />
              <button onClick={createTextAsset} className="w-full bg-primary/20 text-primary hover:bg-primary/30 py-2 rounded-lg text-xs font-bold transition-colors">
                Add to Timeline
              </button>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="p-4 space-y-6">
              {selectedItem ? (
                <>
                  <span className="text-xs font-bold uppercase tracking-wider block">Clip Settings</span>
                  
                  {/* Basic Actions */}
                  <div className="flex gap-2">
                    <button onClick={handleSplit} className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded text-xs flex items-center justify-center gap-1"><Scissors className="h-3 w-3"/> Split</button>
                    <button onClick={handleDelete} className="flex-1 py-2 bg-destructive/20 hover:bg-destructive/40 text-destructive rounded text-xs flex items-center justify-center gap-1"><Trash2 className="h-3 w-3"/> Delete</button>
                  </div>

                  {/* Audio Controls for Video */}
                  {selectedAsset?.type === "video" && (
                    <div className="space-y-2">
                      <label className="text-[10px] text-white/50 uppercase font-bold">Audio</label>
                      <div className="flex gap-2">
                         <button 
                          onClick={() => setTimelineItems(prev => prev.map(i => i.id === selectedItemId ? { ...i, muted: !i.muted } : i))}
                          className={`flex-1 py-2 rounded text-xs flex items-center justify-center gap-1 border ${selectedItem.muted ? 'border-primary text-primary bg-primary/10' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                         >
                           {selectedItem.muted ? <VolumeX className="h-3 w-3"/> : <Volume2 className="h-3 w-3"/>}
                           {selectedItem.muted ? 'Muted' : 'Unmuted'}
                         </button>
                         <button onClick={handleExtractAudio} className="flex-1 py-2 border border-white/10 text-white/60 hover:bg-white/5 rounded text-xs flex items-center justify-center gap-1">
                           <SplitSquareVertical className="h-3 w-3"/> Extract
                         </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] text-white/50 uppercase font-bold">Animation</label>
                    <div className="grid grid-cols-3 gap-2">
                      {["none", "fade", "slide"].map(anim => {
                        const isSel = selectedItem.animation === anim || (anim === "none" && !selectedItem.animation);
                        return (
                          <button key={anim} onClick={() => setTimelineItems(prev => prev.map(i => i.id === selectedItemId ? { ...i, animation: anim as any } : i))} 
                            className={`py-2 rounded-lg text-xs capitalize border ${isSel ? "bg-primary/20 border-primary text-primary" : "border-white/10 text-white/50"}`}>
                            {anim}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold uppercase tracking-wider block">Project</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setAspectRatio("9:16")} className={`py-2 rounded-lg text-xs border ${aspectRatio === "9:16" ? "bg-primary/20 border-primary text-primary" : "border-white/10"}`}><Smartphone className="h-4 w-4 mx-auto mb-1" /> 9:16</button>
                    <button onClick={() => setAspectRatio("16:9")} className={`py-2 rounded-lg text-xs border ${aspectRatio === "16:9" ? "bg-primary/20 border-primary text-primary" : "border-white/10"}`}><Monitor className="h-4 w-4 mx-auto mb-1" /> 16:9</button>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>

        <section className="flex-1 bg-[#080808] relative flex flex-col overflow-hidden">
          <div className="flex-1 relative flex items-center justify-center p-8">
            <div className={`relative bg-black shadow-2xl ring-1 ring-white/10 overflow-hidden transition-all duration-300 ${aspectRatio === "9:16" ? "aspect-[9/16] h-full" : "aspect-video w-full max-w-4xl"}`}>
              {/* Main Track (0) */}
              <div className="absolute inset-0 bg-[#111] flex items-center justify-center">
                {!mainAsset && <span className="text-white/10 font-black tracking-widest text-2xl">MAIN</span>}
                {mainAsset?.type === "image" && <img src={mainAsset.url} className="w-full h-full object-cover" />}
                {mainAsset?.type === "video" && <video ref={(el) => { mediaRefs.current[mainItem!.id] = el; }} src={mainAsset.url} className="w-full h-full object-cover" muted={mainItem!.muted} />}
              </div>
              
              {/* Overlays Track (1) */}
              {overlayItems.map(item => {
                const asset = mediaPool.find(a => a.id === item.assetId);
                if (!asset) return null;
                let style: React.CSSProperties = {};
                if (item.animation === "fade") {
                  style.opacity = Math.min((currentTime - item.startAt) / 0.5, (item.startAt + item.duration - currentTime) / 0.5, 1);
                } else if (item.animation === "slide") {
                  style.transform = `translateY(${Math.max(0, 100 - ((currentTime - item.startAt) / 0.5) * 100)}%)`;
                }
                return (
                  <div key={item.id} className="absolute inset-0 flex items-center justify-center p-8 transition-transform pointer-events-none" style={style}>
                    {asset.type === "image" ? <img src={asset.url} className="max-w-full max-h-full object-contain rounded-xl drop-shadow-2xl ring-1 ring-white/20" /> : <video ref={(el) => { mediaRefs.current[item.id] = el; }} src={asset.url} className="max-w-full max-h-full object-contain rounded-xl drop-shadow-2xl ring-1 ring-white/20" muted={item.muted} />}
                  </div>
                );
              })}

              {/* Text Track (2) */}
              {textItems.map(item => {
                const asset = mediaPool.find(a => a.id === item.assetId);
                if (!asset || asset.type !== "text") return null;
                return (
                  <div key={item.id} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="bg-black/60 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-black uppercase text-3xl shadow-2xl border border-white/20 text-center max-w-[90%]">
                      {asset.content}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="h-12 flex items-center justify-center gap-6 bg-black/40 border-t border-white/5">
             <button onClick={togglePlay} className="text-white hover:text-primary transition-colors">
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-1" />}
            </button>
            <div className="text-xs font-mono text-white/50">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </div>
          </div>
        </section>
      </main>

      <footer className="h-64 bg-[#111] border-t border-white/10 flex flex-col select-none">
        <div className="h-10 border-b border-white/5 bg-[#1a1a1a] flex items-center px-4 justify-between text-[10px] text-white/50">
          <div className="flex gap-4 items-center">
             <button className="hover:text-white flex items-center gap-1" onClick={handleSplit}><Scissors className="h-3 w-3" /> Split</button>
             <button className="hover:text-destructive flex items-center gap-1" onClick={handleDelete}><Trash2 className="h-3 w-3" /> Delete</button>
             {selectedAsset?.type === "video" && (
                <button className="hover:text-white flex items-center gap-1 border-l border-white/10 pl-4" onClick={handleExtractAudio}><SplitSquareVertical className="h-3 w-3" /> Extract Audio</button>
             )}
          </div>
        </div>

        <div ref={timelineRef} className="flex-1 overflow-x-auto overflow-y-auto relative p-2 space-y-1">
          <div 
            className="h-6 relative min-w-full mb-2 border-b border-white/10 cursor-pointer group/ruler" 
            style={{ width: `${Math.max(100, (duration / 60) * 100)}%` }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const offsetX = e.clientX - rect.left;
              handleSeek([ (offsetX / rect.width) * duration ]);
            }}
          >
             {[...Array(Math.max(10, Math.floor(duration / 2)))].map((_, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-l border-white/10" style={{ left: `${(i * 2 / duration) * 100}%` }}>
                <span className="absolute left-1 top-0 text-[8px] text-white/30">{formatDuration(i * 2)}</span>
              </div>
            ))}
            {/* Scrubber slider ONLY in ruler area */}
            <div className="absolute inset-0 z-50 opacity-0 cursor-ew-resize">
              <Slider value={[currentTime]} max={duration || 100} step={0.01} onValueChange={handleSeek} className="h-full" />
            </div>
          </div>

          {[
            { id: 2, label: "TEXT", icon: Type, color: "bg-purple-500", ring: "ring-purple-400" },
            { id: 1, label: "OVR", icon: Layers, color: "bg-blue-500", ring: "ring-blue-400" },
            { id: 0, label: "MAIN", icon: Monitor, color: "bg-emerald-500", ring: "ring-emerald-400" },
            { id: 3, label: "AUDIO", icon: Music, color: "bg-amber-500", ring: "ring-amber-400" }
          ].map(track => (
            <div
              key={track.id}
              onDragOver={(e) => { e.preventDefault(); setDropTargetTrack(track.id); e.dataTransfer.dropEffect = "move"; }}
              onDragLeave={() => setDropTargetTrack(null)}
              onDrop={(e) => handleDrop(e, track.id)}
              className={`h-12 relative min-w-full rounded border transition-colors ${
                dropTargetTrack === track.id
                  ? "bg-white/10 border-white/30"
                  : "bg-white/[0.02] border-white/5"
              }`}
              style={{ width: `${Math.max(100, (duration / 60) * 100)}%` }}
            >
              <div className="absolute -left-12 top-0 bottom-0 w-12 flex flex-col items-center justify-center bg-black/60 border-r border-white/5 z-10 sticky">
                <track.icon className="h-3 w-3 text-white/40 mb-0.5" />
                <span className="text-[7px] font-black tracking-widest text-white/40">{track.label}</span>
              </div>

              {timelineItems.filter(i => i.trackIndex === track.id).map(item => {
                const asset = mediaPool.find(a => a.id === item.assetId);
                const isSelected = selectedItemId === item.id;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onClick={() => { setSelectedItemId(item.id); setActiveTab("settings"); }}
                    className={`absolute top-0.5 bottom-0.5 rounded overflow-hidden flex items-center cursor-pointer border group/clip ${
                      isSelected
                        ? `ring-2 ${track.ring} z-20 border-white/40 ${track.color}`
                        : `z-10 border-black/20 ${track.color.replace("500", "600")}`
                    }`}
                    style={{ left: `${(item.startAt / duration) * 100}%`, width: `${(item.duration / duration) * 100}%` }}
                  >
                    {/* Thumbnail / waveform preview */}
                    <div className="absolute inset-0 opacity-20 pointer-events-none flex overflow-hidden">
                      {asset?.type === "image" && <img src={asset.url} className="w-full h-full object-cover" />}
                      {asset?.type === "video" && <video src={asset.url} className="w-full h-full object-cover" />}
                      {asset?.type === "audio" && (
                        <div className="flex h-full w-full items-end gap-[1px] px-0.5">
                          {[...Array(40)].map((_, i) => <div key={i} className="flex-1 bg-amber-400 rounded-sm" style={{ height: `${20 + Math.sin(i * 0.8) * 30 + Math.random() * 30}%` }} />)}
                        </div>
                      )}
                    </div>

                    <span className="text-[9px] px-2 truncate text-white drop-shadow-md font-bold relative z-10 pointer-events-none flex-1">{asset?.name || "Media"}</span>

                    {/* Inline actions shown when selected */}
                    {isSelected && (
                      <div className="absolute top-0 right-6 bottom-0 flex items-center gap-0.5 z-20 pr-1" onClick={e => e.stopPropagation()}>
                        <button onClick={handleSplit} title="Split at playhead" className="p-0.5 bg-black/60 hover:bg-white/20 rounded text-white/80 hover:text-white"><Scissors className="h-2.5 w-2.5" /></button>
                        <button onClick={handleDelete} title="Delete" className="p-0.5 bg-black/60 hover:bg-red-600/80 rounded text-white/80 hover:text-white"><Trash2 className="h-2.5 w-2.5" /></button>
                        {asset?.type === "video" && <button onClick={handleExtractAudio} title="Extract audio" className="p-0.5 bg-black/60 hover:bg-amber-600/80 rounded text-white/80 hover:text-white"><SplitSquareVertical className="h-2.5 w-2.5" /></button>}
                        {asset?.type === "video" && <button onClick={() => setTimelineItems(prev => prev.map(i => i.id === item.id ? { ...i, muted: !i.muted } : i))} title={item.muted ? "Unmute" : "Mute"} className="p-0.5 bg-black/60 hover:bg-white/20 rounded text-white/80 hover:text-white">{item.muted ? <VolumeX className="h-2.5 w-2.5" /> : <Volume2 className="h-2.5 w-2.5" />}</button>}
                      </div>
                    )}

                    {item.muted && <VolumeX className="h-2 w-2 absolute right-7 bottom-1 text-white/50 z-10" />}

                    {/* Right-edge resize handle */}
                    <div
                      onMouseDown={(e) => handleResizeStart(e, item)}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-30 flex items-center justify-center hover:bg-white/30 active:bg-white/50 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="w-0.5 h-3 bg-white/50 rounded" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="absolute top-0 bottom-0 w-px bg-white z-30 pointer-events-none" style={{ left: `calc(0.5rem + ${(currentTime / duration) * (100 - 0)}%)` }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-sm custom-polygon" />
          </div>
        </div>
      </footer>
    </div>
  );
}
