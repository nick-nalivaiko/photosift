import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SortMode = "solo" | "multi";
export type SortPhase =
  | "idle"
  | "scanning"
  | "analysis"
  | "copying"
  | "done"
  | "paused"
  | "stopped";

export interface Preset {
  id: string;
  name: string;
  config: SortingConfig;
  threshold: number;
  threads: number;
  mode?: never; // Obsolete
  persons: {
    id: string;
    name: string;
    referencePaths: string[];
  }[];
}

export interface Person {
  id: string;
  name: string;
  referenceIds: string[];
}

export interface ReferencePhoto {
  id: string;
  path: string;
  thumbnailUrl: string;
  hasFace: boolean;
  hasMultipleFaces: boolean;
  slotId: string;
}

export interface SortingConfig {
  sortByYear: boolean;
  splitSoloGroup: boolean;
  collectNoPeople: boolean;
  collectJunk: boolean;
  collectOthers: boolean;
  collectUnrecognized: boolean;
  collectSmall: boolean;
  smallFileSizeMinMb: number;
  smallFileSizeMaxMb: number;
  detectDuplicates: boolean;
  moveFiles: boolean;
  recursive: boolean;
  processVideo: boolean;
  logFile: boolean;
  exifCorrection: boolean;
}

export interface SortStats {
  total: number;
  processed: number;
  matched: number;
  solo: number;
  together: number;
  group: number;
  no_people: number;
  junk: number;
  others: number;
  unrecognized: number;
  small: number;
  duplicates: number;
  errors: number;
  folder_tree?: { name: string; count: number; children: any[] }[];
}

interface AppState {
  // Mode
  mode: SortMode;
  setMode: (mode: SortMode) => void;

  // Presets
  presets: Preset[];
  activePresetId: string | null;
  savePreset: (name: string) => void;
  loadPreset: (id: string | null) => void;
  deletePreset: (id: string) => void;

  // References
  references: ReferencePhoto[];
  addReference: (ref: ReferencePhoto, linkToSelected?: boolean) => void;
  removeReference: (id: string) => void;
  clearReferences: () => void;

  // Persons (group mode)
  persons: Person[];
  selectedPersonId: string | null;
  addPerson: (name: string) => string; // returns id
  removePerson: (id: string) => void;
  setSelectedPerson: (id: string | null) => void;

  // Folders
  sourceFolder: string;
  targetFolder: string;
  sourceFileCount: number;
  setSourceFolder: (path: string, fileCount: number) => void;
  setTargetFolder: (path: string) => void;

  // Sorting config
  config: SortingConfig;
  updateConfig: (partial: Partial<SortingConfig>) => void;

  // Threshold & threads
  threshold: number;
  setThreshold: (v: number) => void;
  threads: number;
  setThreads: (v: number) => void;

  // Sorting state
  phase: SortPhase;
  setPhase: (phase: SortPhase) => void;
  progress: { current: number; total: number };
  setProgress: (current: number, total: number) => void;
  stats: SortStats;
  setStats: (stats: SortStats) => void;

  // System
  gpuAvailable: boolean;
  gpuName: string;
  cpuCount: number;
  setSystemInfo: (info: {
    gpu_available: boolean;
    gpu_name: string;
    cpu_count: number;
  }) => void;

  // Language
  lang: "en" | "ru" | "uk";
  toggleLang: () => void;

  // Theme
  theme: "dark" | "light";
  toggleTheme: () => void;

  // Engine
  engineReady: boolean;
  setEngineReady: (ready: boolean) => void;

  // Reset
  resetSession: () => void;
}

const defaultConfig: SortingConfig = {
  sortByYear: false,
  splitSoloGroup: true,
  collectNoPeople: true,
  collectJunk: true,
  collectOthers: true,
  collectUnrecognized: true,
  collectSmall: false,
  smallFileSizeMinMb: 0,
  smallFileSizeMaxMb: 1,
  detectDuplicates: true,
  moveFiles: false,
  recursive: true,
  processVideo: false,
  logFile: false,
  exifCorrection: true,
};

const emptyStats: SortStats = {
  total: 0,
  processed: 0,
  matched: 0,
  solo: 0,
  together: 0,
  group: 0,
  no_people: 0,
  junk: 0,
  others: 0,
  unrecognized: 0,
  small: 0,
  duplicates: 0,
  errors: 0,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: "solo",
      setMode: (mode) => set({ mode }),

      presets: [],
      activePresetId: null,
      savePreset: (name) =>
        set((s) => {
          const existing = s.presets.find((p) => p.name === name);
          const presetData = {
            config: s.config,
            threshold: s.threshold,
            threads: s.threads,
            persons: s.persons.map((p) => ({
              id: p.id,
              name: p.name,
              referencePaths: p.referenceIds
                .map((rid) => s.references.find((r) => r.id === rid)?.path)
                .filter(Boolean) as string[],
            })),
          };
          if (existing) {
            // Update existing preset with same name
            return {
              presets: s.presets.map((p) =>
                p.id === existing.id ? { ...p, ...presetData } : p,
              ),
              activePresetId: existing.id,
            };
          }
          const newPreset: Preset = {
            id: crypto.randomUUID(),
            name,
            ...presetData,
          };
          return {
            presets: [...s.presets, newPreset],
            activePresetId: newPreset.id,
          };
        }),
      loadPreset: (id) =>
        set((s) => {
          if (!id)
            return {
              activePresetId: null,
              config: defaultConfig,
              threshold: 0.6,
              references: [],
              persons: [],
              selectedPersonId: null,
              sourceFolder: "",
              targetFolder: "",
              sourceFileCount: 0,
            };
          const p = s.presets.find((x) => x.id === id);
          if (p) {
            return {
              config: p.config,
              threshold: p.threshold,
              threads: p.threads ?? s.threads,
              persons: p.persons
                ? p.persons.map((person) => ({
                    id: person.id,
                    name: person.name,
                    referenceIds: [], // Will be populated when refs load
                  }))
                : [],
              selectedPersonId: p.persons?.[0]?.id ?? null,
              activePresetId: id,
            };
          }
          return {};
        }),
      deletePreset: (id) =>
        set((s) => {
          const isDeletingActive = s.activePresetId === id;
          return {
            presets: s.presets.filter((x) => x.id !== id),
            activePresetId: isDeletingActive ? null : s.activePresetId,
            ...(isDeletingActive
              ? {
                  persons: [],
                  references: [],
                  selectedPersonId: null,
                }
              : {}),
          };
        }),

      references: [],
      addReference: (ref, autoLink = true) =>
        set((s) => {
          // Prevent duplicate reference entries in global array
          const refExists = s.references.some((r) => r.id === ref.id);
          const newReferences = refExists
            ? s.references
            : [...s.references, ref];

          return {
            references: newReferences,
            // Link this reference to the target slot's person
            persons:
              autoLink && ref.slotId !== "default"
                ? s.persons.map((p) =>
                    p.id === ref.slotId
                      ? {
                          ...p,
                          referenceIds: [
                            ...new Set([...p.referenceIds, ref.id]),
                          ],
                        }
                      : p,
                  )
                : s.persons,
          };
        }),
      removeReference: (id) =>
        set((s) => ({
          references: s.references.filter((r) => r.id !== id),
          persons: s.persons.map((p) => ({
            ...p,
            referenceIds: p.referenceIds.filter((rid) => rid !== id),
          })),
        })),
      clearReferences: () => set({ references: [] }),

      persons: [],
      selectedPersonId: null,
      addPerson: (name) => {
        const id = crypto.randomUUID();
        set((s) => ({
          persons: [...s.persons, { id, name, referenceIds: [] }],
          selectedPersonId: id,
        }));
        return id;
      },
      removePerson: (id) =>
        set((s) => {
          const person = s.persons.find((p) => p.id === id);
          return {
            persons: s.persons.filter((p) => p.id !== id),
            selectedPersonId:
              s.selectedPersonId === id
                ? s.persons.length > 1
                  ? s.persons.find((p) => p.id !== id)?.id || null
                  : null
                : s.selectedPersonId,
            // Also remove that person's references
            references: person
              ? s.references.filter((r) => !person.referenceIds.includes(r.id))
              : s.references,
          };
        }),
      setSelectedPerson: (id) => set({ selectedPersonId: id }),

      sourceFolder: "",
      targetFolder: "",
      sourceFileCount: 0,
      setSourceFolder: (path, fileCount) =>
        set({ sourceFolder: path, sourceFileCount: fileCount }),
      setTargetFolder: (path) => set({ targetFolder: path }),

      config: defaultConfig,
      updateConfig: (partial) =>
        set((s) => ({ config: { ...s.config, ...partial } })),

      threshold: 0.45,
      setThreshold: (v) => set({ threshold: v }),
      threads: 4,
      setThreads: (v) => set({ threads: v }),

      phase: "idle",
      setPhase: (phase) => set({ phase }),
      progress: { current: 0, total: 0 },
      setProgress: (current, total) => set({ progress: { current, total } }),
      stats: emptyStats,
      setStats: (stats) => set({ stats }),

      gpuAvailable: false,
      gpuName: "N/A",
      cpuCount: navigator?.hardwareConcurrency || 4,
      setSystemInfo: (info) =>
        set({
          gpuAvailable: info.gpu_available,
          gpuName: info.gpu_name,
          cpuCount: info.cpu_count,
        }),

      lang: "ru",
      toggleLang: () =>
        set((s) => {
          const order = ["ru", "uk", "en"] as const;
          const idx = order.indexOf(s.lang as any);
          return { lang: order[(idx + 1) % order.length] };
        }),

      theme: "dark",
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      engineReady: false,
      setEngineReady: (ready) => set({ engineReady: ready }),

      resetSession: () =>
        set({
          phase: "idle",
          progress: { current: 0, total: 0 },
          stats: emptyStats,
        }),
    }),
    {
      name: "photosift-storage",
      partialize: (state) => ({
        mode: state.mode,
        references: state.references,
        persons: state.persons,
        selectedPersonId: state.selectedPersonId,
        sourceFolder: state.sourceFolder,
        targetFolder: state.targetFolder,
        config: state.config,
        threshold: state.threshold,
        threads: state.threads,
        lang: state.lang,
        presets: state.presets,
        activePresetId: state.activePresetId,
      }),
    },
  ),
);
