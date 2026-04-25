import { Layout } from "@/components/Layout";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { get, set, del, keys } from "idb-keyval";
import { format } from "date-fns";
import {
  FolderOpen, Plus, Trash2, Film, Clock, Edit3,
  Clapperboard, FolderPlus, Layers
} from "lucide-react";

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  aspectRatio: string;
  clipCount: number;
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const allKeys = await keys();
      const projectKeys = allKeys.filter(k => typeof k === "string" && (k as string).startsWith("project_meta_"));
      const metas = await Promise.all(
        projectKeys.map(k => get(k as string))
      );
      const sorted = (metas.filter(Boolean) as ProjectMeta[]).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setProjects(sorted);
    } catch (err) {
      console.error("Failed to load projects", err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const createProject = async () => {
    const name = newName.trim() || "Untitled Project";
    const id = `proj_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    const meta: ProjectMeta = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      aspectRatio: "9:16",
      clipCount: 0
    };

    // Save meta + empty project state
    await set(`project_meta_${id}`, meta);
    await set(`project_${id}`, { mediaPool: [], timelineItems: [], aspectRatio: "9:16" });

    setLocation(`/editor/${id}`);
  };

  const deleteProject = async (id: string) => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await del(`project_meta_${id}`);
    await del(`project_${id}`);
    // Also delete associated file blobs
    const allKeys = await keys();
    const fileKeys = allKeys.filter(k => typeof k === "string" && (k as string).startsWith("file_"));
    // We can't easily know which files belong to which project, so just clean up meta
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Clapperboard className="h-8 w-8 text-primary" />
            My Projects
          </h1>
          <p className="text-white/60">
            Each project is a standalone editing session — your media and timeline are saved automatically.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 shrink-0"
        >
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* New Project Dialog */}
      {showNew && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-2">New Project</h2>
            <p className="text-white/50 text-sm mb-6">Give your project a name to get started.</p>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createProject(); if (e.key === "Escape") setShowNew(false); }}
              placeholder="e.g. Brand Video Q2 2025"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary mb-6 placeholder-white/20"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold transition-colors"
              >
                Create & Open
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse border border-white/5" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 mb-6">
            <Clapperboard className="h-10 w-10 text-white/20" />
          </div>
          <h3 className="text-2xl font-bold mb-3">No projects yet</h3>
          <p className="text-white/40 max-w-xs text-sm leading-relaxed mb-8">
            Create your first project to start editing. Your media, timeline, and all edits will be saved automatically.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-xl font-bold text-sm transition-all"
          >
            <Plus className="h-4 w-4" /> Create First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => (
            <div
              key={project.id}
              className="group relative glass-card rounded-2xl border border-white/5 bg-black/20 overflow-hidden hover:border-primary/40 transition-all duration-300 hover:translate-y-[-4px] shadow-xl hover:shadow-primary/10"
            >
              {/* Thumbnail area */}
              <Link href={`/editor/${project.id}`}>
                <div className="aspect-video relative bg-gradient-to-br from-[#1a1a1a] to-[#111] flex items-center justify-center cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <Layers className="h-12 w-12 text-white/10" />
                  <div className="absolute bottom-3 left-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/30 border border-white/10 px-2 py-0.5 rounded">
                      {project.aspectRatio}
                    </span>
                  </div>
                  {/* Hover play overlay */}
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="bg-primary text-primary-foreground rounded-full p-3 shadow-xl scale-75 group-hover:scale-100 transition-transform">
                      <Edit3 className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </Link>

              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {format(new Date(project.updatedAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                    title="Delete project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <Link href={`/editor/${project.id}`}>
                  <button className="mt-4 w-full text-center bg-white/5 hover:bg-primary/20 hover:text-primary text-[11px] font-black uppercase py-2.5 rounded-xl border border-white/5 hover:border-primary/30 transition-all tracking-wider">
                    Open in Studio
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
