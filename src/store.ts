import { create } from 'zustand';
import type { Project } from './types';
import { api } from './api';

type S = {
  project: Project | null;
  view: string;
  selectedVisualId: string | null;
  loading: boolean;
  error: string | null;
  lastSavedAt: string | null;
  history: Project[];
  future: Project[];
  canUndo: boolean;
  canRedo: boolean;
  navCollapsed: boolean;
  load: () => Promise<void>;
  setView: (v: string) => void;
  selectVisual: (id: string | null) => void;
  update: (fn: (p: Project) => Project) => void;
  replaceProject: (project: Project, recordHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  toggleNavCollapsed: () => void;
  setNavCollapsed: (v: boolean) => void;
};

const MAX_HISTORY=50;
const clone=(p:Project)=>structuredClone(p);
const persist=(p:Project)=>{ api('/project',{method:'PUT',body:JSON.stringify(p)}).catch(()=>{}); };

export const useStudio = create<S>((set, get) => ({
  project: null, view: 'home', selectedVisualId: null, loading: false, error: null,
  lastSavedAt: null, history: [], future: [], canUndo:false, canRedo:false, navCollapsed:false,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const project = await api<Project>('/project');
      if (!project) throw new Error('Backend returned no project.');
      set({ project, loading: false, history:[], future:[], canUndo:false, canRedo:false });
    } catch (e: any) { set({ loading: false, error: e?.message || String(e) }); }
  },

  setView: (view) => set({ view }),
  toggleNavCollapsed: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
  setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
  selectVisual: (selectedVisualId) => set({ selectedVisualId }),

  update: (fn) => set((s) => {
    if(!s.project)return {} as any;
    const before=clone(s.project); const after=fn(clone(s.project));
    const history=[...s.history.slice(-(MAX_HISTORY-1)),before];
    return {project:after,history,future:[],canUndo:true,canRedo:false};
  }),

  replaceProject: (project, recordHistory=true) => set((s) => {
    if(!recordHistory || !s.project)return {project,selectedVisualId:null,lastSavedAt:new Date().toISOString()};
    const history=[...s.history.slice(-(MAX_HISTORY-1)),clone(s.project)];
    return {project,selectedVisualId:null,lastSavedAt:new Date().toISOString(),history,future:[],canUndo:true,canRedo:false};
  }),

  undo: () => {
    const s=get(); if(!s.project||!s.history.length)return;
    const previous=s.history[s.history.length-1];
    const history=s.history.slice(0,-1); const future=[clone(s.project),...s.future].slice(0,MAX_HISTORY);
    const next=clone(previous); set({project:next,history,future,canUndo:history.length>0,canRedo:true,selectedVisualId:null});persist(next);
  },
  redo: () => {
    const s=get(); if(!s.project||!s.future.length)return;
    const next=s.future[0]; const future=s.future.slice(1); const history=[...s.history,clone(s.project)].slice(-MAX_HISTORY);
    const p=clone(next);set({project:p,history,future,canUndo:true,canRedo:future.length>0,selectedVisualId:null});persist(p);
  },

  save: async () => {
    const p = get().project; if (!p) return;
    if (!p.report.name || p.report.name.trim() === 'Untitled Report') {
      const name = window.prompt('Report name', p.report.name || 'Untitled Report'); if (!name?.trim()) return;
      p.report.name = name.trim(); set({ project: clone(p) });
    }
    await api('/project', { method: 'PUT', body: JSON.stringify(p) });
    set({ lastSavedAt: new Date().toISOString() });
  }
}));
