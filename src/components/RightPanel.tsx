import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { t, type LangKey } from "../lib/i18n";
import { startSorting, pauseSorting, resumeSorting, stopSorting } from "../lib/ipc";
import { HelpTooltip } from "./HelpTooltip";

interface ParamToggle {
  icon: string;
  titleKey: LangKey;
  descKey: LangKey;
  configKey: keyof ReturnType<typeof useAppStore.getState>["config"];
}

const SORT_PARAMS: ParamToggle[] = [
  { icon: "calendar_month", titleKey: "sortByYear", descKey: "sortByYearDesc", configKey: "sortByYear" },
  { icon: "person", titleKey: "splitSoloGroup", descKey: "splitSoloGroupDesc", configKey: "splitSoloGroup" },
  { icon: "groups", titleKey: "others", descKey: "othersDesc", configKey: "collectOthers" },
  { icon: "image", titleKey: "noPeople", descKey: "noPeopleDesc", configKey: "collectNoPeople" },
  { icon: "help", titleKey: "unrecognized", descKey: "unrecognizedDesc", configKey: "collectUnrecognized" },
  { icon: "architecture", titleKey: "smallFiles", descKey: "smallFilesDesc", configKey: "collectSmall" },
  { icon: "delete", titleKey: "junk", descKey: "junkDesc", configKey: "collectJunk" },
  { icon: "file_copy", titleKey: "duplicates", descKey: "duplicatesDesc", configKey: "detectDuplicates" },
  { icon: "content_cut", titleKey: "moveFiles", descKey: "moveFilesDesc", configKey: "moveFiles" },
];

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<"results" | "plan" | "settings">("plan");
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const {
    config, updateConfig, threshold, setThreshold,
    threads, setThreads, cpuCount, lang,
    phase, setPhase, progress, stats,
    sourceFolder, targetFolder, references,
    persons, setProgress,
  } = useAppStore();

  useEffect(() => {
    if (phase === "done") {
      setActiveTab("results");
    }
  }, [phase]);

  // Timer tracking
  useEffect(() => {
    if (phase === "scanning" || phase === "analysis" || phase === "copying") {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now() - pausedElapsedRef.current;
      }
      const id = setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const m = String(Math.floor(secs / 60)).padStart(2, "0");
        const s = String(secs % 60).padStart(2, "0");
        setElapsedTime(`${m}:${s}`);
      }, 1000);
      return () => clearInterval(id);
    } else if (phase === "paused") {
      if (startTimeRef.current) {
        pausedElapsedRef.current = Date.now() - startTimeRef.current;
        startTimeRef.current = 0;
      }
    } else if (phase === "idle") {
      setElapsedTime("00:00");
      startTimeRef.current = 0;
      pausedElapsedRef.current = 0;
    }
  }, [phase]);

  const maxThreads = Math.max(1, cpuCount - 1); // Оставляем 1 ядро системе
  const threadOptions = Array.from(new Set([1, 2, 4, 6, 8, 12, 16, 24, 32].filter(n => n <= maxThreads).concat(maxThreads))).sort((a, b) => a - b);

  const thresholdLabel = threshold < 0.35
    ? t(lang, "soft")
    : threshold > 0.55
      ? t(lang, "strict")
      : t(lang, "normal");

  const canStart = sourceFolder && targetFolder && references.length > 0 && phase === "idle";
  const isRunning = phase === "analysis" || phase === "copying" || phase === "scanning";
  const isPaused = phase === "paused";
  const hasResults = stats.total > 0 || phase === "done";

  const handleStart = async () => {
    setPhase("scanning");
    setProgress(0, 0);
    setActiveTab("results");
    try {
      const result = await startSorting({
        source_folder: sourceFolder,
        target_folder: targetFolder,
        threshold, threads,
        recursive: config.recursive,
        process_video: config.processVideo,
        move_files: config.moveFiles,
        sort_by_year: config.sortByYear,
        split_solo_group: config.splitSoloGroup,
        collect_no_people: config.collectNoPeople,
        collect_junk: config.collectJunk,
        collect_others: config.collectOthers,
        collect_small: config.collectSmall,
        small_size_min_mb: config.smallFileSizeMinMb ?? 0,
        small_size_max_mb: config.smallFileSizeMaxMb ?? 1,
        detect_duplicates: config.detectDuplicates,
        persons: persons,
        labels: {
          matched: t(lang, "matched"),
          solo: t(lang, "solo"),
          together: t(lang, "together"),
          group: t(lang, "group"),
          no_people: t(lang, "noFaces"),
          junk: t(lang, "junkLabel"),
          others: t(lang, "othersLabel"),
          unrecognized: t(lang, "unrecognizedLabel"),
          small: `${t(lang, "smallFiles")} ${config.smallFileSizeMinMb ?? 0}-${(config.smallFileSizeMaxMb ?? 1) >= 10 ? '∞' : config.smallFileSizeMaxMb ?? 1}MB`,
          duplicates: t(lang, "duplicatesLabel"),
          unknown_year: t(lang, "unknownYear" as any),
        }
      });
      console.log("Sort started:", result);
      // Wait for IPC 'progress' events to update the phase to 'done' and populate stats
    } catch (err) {
      console.error("Sorting failed:", err);
      setPhase("idle");
    }
  };

  const handlePause = async () => { await pauseSorting(); setPhase("paused"); };
  const handleResume = async () => { await resumeSorting(); setPhase("analysis"); };
  const handleStop = async () => { await stopSorting(); setPhase("idle"); };

  return (
    <section className="flex-1 flex flex-col relative bg-bg-dark/40">
      {/* Tabs Layout */}
      <div className="flex items-center gap-8 px-8 pt-6 border-b border-border/30 shrink-0">
        <button
          onClick={() => hasResults && setActiveTab("results")}
          disabled={!hasResults}
          className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-colors border-b-2 ${
            activeTab === "results" ? "text-primary border-primary" : "text-text-dim border-transparent hover:text-text-muted"
          } ${!hasResults && "opacity-50 cursor-not-allowed"}`}
        >
          {t(lang, "resultsTab" as any) || "RESULTS"}
        </button>
        <button
          onClick={() => setActiveTab("plan")}
          className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer border-b-2 ${
            activeTab === "plan" ? "text-primary border-primary" : "text-text-dim border-transparent hover:text-text-muted"
          }`}
        >
          {t(lang, "sortingPlanTab")}
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer border-b-2 ${
            activeTab === "settings" ? "text-primary border-primary" : "text-text-dim border-transparent hover:text-text-muted"
          }`}
        >
          {t(lang, "fineTuneSettingsTab")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 pb-32">
        {activeTab === "plan" && (
          <div className="grid grid-cols-1 gap-3">
                {SORT_PARAMS.map((param) => {
                  const isMove = param.configKey === "moveFiles";
                  const isChecked = !!config[param.configKey];

                  return (
                    <div key={param.configKey + param.titleKey} className="contents">
                      {param.configKey === "moveFiles" && (
                        <div className="h-px bg-border/40 w-full my-2 col-span-1" />
                      )}
                      
                      <div className={`flex flex-col gap-2 p-3 rounded-lg transition-colors border ${
                        isMove 
                          ? isChecked 
                            ? "bg-warning/10 border-warning/40 shadow-inner" 
                            : "bg-surface/30 border-border/30 hover:border-warning/30"
                          : "bg-surface/50 border-border/30 hover:border-primary/40"
                      }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          isMove 
                            ? isChecked ? "bg-warning/20" : "bg-danger/10"
                            : "bg-primary/10"
                        }`}>
                          <span className={`icon ${
                            isMove 
                              ? isChecked ? "text-warning" : "text-danger" 
                              : "text-primary"
                          }`}>{param.icon}</span>
                        </div>
                        <div>
                          <p className={`text-sm font-bold ${
                            isMove && isChecked ? "text-warning" : ""
                          }`}>{t(lang, param.titleKey)}</p>
                          <p className={`text-xs ${
                            isMove && isChecked ? "text-warning/80" : "text-text-muted"
                          }`}>{t(lang, param.descKey)}</p>
                        </div>
                      </div>
                      
                      {isMove ? (
                        <button
                          onClick={() => updateConfig({ [param.configKey]: !isChecked })}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            isChecked ? "bg-warning" : "bg-bg-dark border border-border"
                          }`}
                        >
                          <div className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white transition-transform ${
                            isChecked ? "translate-x-5 shadow-sm" : "translate-x-0"
                          }`} />
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          className="toggle-switch"
                          checked={isChecked}
                          onChange={(e) => updateConfig({ [param.configKey]: e.target.checked })}
                        />
                      )}
                    </div>
                    {/* Size Filter Settings */}
                    {param.configKey === "collectSmall" && config.collectSmall && (
                      <div className="mt-4 ml-[52px] mb-2 px-1 pb-2">
                        {/* Preset Chips */}
                        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 custom-scrollbar">
                          {[
                            { label: "150–500 KB", min: 0.15, max: 0.5 },
                            { label: "150 KB–1 MB", min: 0.15, max: 1 },
                            { label: "150 KB–2 MB", min: 0.15, max: 2 },
                            { label: "150 KB–5 MB", min: 0.15, max: 5 },
                          ].map(preset => (
                            <button
                              key={preset.label}
                              className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors border cursor-pointer ${
                                config.smallFileSizeMinMb === preset.min && config.smallFileSizeMaxMb === preset.max
                                  ? "bg-primary/20 text-primary border-primary/50"
                                  : "bg-surface text-text-muted border-border hover:text-text hover:border-text-muted"
                              }`}
                              onClick={() => updateConfig({ smallFileSizeMinMb: preset.min, smallFileSizeMaxMb: preset.max })}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex justify-between items-center mb-4">
                          <label className="text-[10px] uppercase font-bold text-text-muted">
                            Min: <span className="text-primary">{Number((config.smallFileSizeMinMb ?? 0).toFixed(2))} MB</span>
                          </label>
                          <label className="text-[10px] uppercase font-bold text-text-muted">
                            Max: <span className="text-primary">{
                              (config.smallFileSizeMaxMb ?? 1) >= 10 
                                ? '∞' 
                                : `${Number((config.smallFileSizeMaxMb ?? 1).toFixed(2))} MB`
                            }</span>
                          </label>
                        </div>
                        
                        <div className="relative w-full h-1.5 bg-border/20 rounded-lg">
                          <style>
                            {`
                              .dual-slider {
                                -webkit-appearance: none;
                                appearance: none;
                                background: transparent;
                                pointer-events: none;
                              }
                              .dual-slider::-webkit-slider-thumb {
                                -webkit-appearance: none;
                                pointer-events: auto;
                                width: 14px;
                                height: 14px;
                                border-radius: 50%;
                                background: var(--color-primary);
                                cursor: pointer;
                                box-shadow: 0 0 0 2px var(--color-bg-dark);
                              }
                              .dual-slider::-moz-range-thumb {
                                pointer-events: auto;
                                width: 14px;
                                height: 14px;
                                border: none;
                                border-radius: 50%;
                                background: var(--color-primary);
                                cursor: pointer;
                                box-shadow: 0 0 0 2px var(--color-bg-dark);
                              }
                            `}
                          </style>
                          {/* Active range track */}
                          <div 
                            className="absolute h-full bg-primary rounded-lg transition-all duration-75"
                            style={{ 
                              left: `${((config.smallFileSizeMinMb ?? 0) / 10) * 100}%`, 
                              right: `${100 - ((config.smallFileSizeMaxMb ?? 1) / 10) * 100}%` 
                            }}
                          ></div>
                          
                          {/* Min slider */}
                          <input 
                            type="range" 
                            min="0" max="10" step="0.05"
                            value={config.smallFileSizeMinMb ?? 0}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              updateConfig({ smallFileSizeMinMb: Math.min(v, config.smallFileSizeMaxMb ?? 1) });
                            }}
                            className="dual-slider absolute top-1/2 -translate-y-1/2 left-0 w-full h-full m-0"
                            style={{ zIndex: (config.smallFileSizeMinMb ?? 0) > 5 ? 4 : 5 }}
                          />
                          
                          {/* Max slider */}
                          <input 
                            type="range" 
                            min="0" max="10" step="0.05"
                            value={config.smallFileSizeMaxMb ?? 1}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              updateConfig({ smallFileSizeMaxMb: Math.max(v, config.smallFileSizeMinMb ?? 0) });
                            }}
                            className="dual-slider absolute top-1/2 -translate-y-1/2 left-0 w-full h-full m-0"
                            style={{ zIndex: 4 }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {param.configKey === "collectUnrecognized" && (
                    <div className="h-px bg-border/40 w-full my-2 col-span-1" />
                  )}
                  </div>
                  );
                })}
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-10">
                {/* Threshold & Threads */}
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-6 flex items-center">
                      {t(lang, "threshold")}
                      <HelpTooltip lang={lang} titleKey="thresholdHelpTitle" descKey="thresholdHelpDesc" position="tooltip-bottom" />
                    </h3>
                <div className="px-2">
                  <input
                    type="range"
                    min={20} max={75}
                    value={Math.round(threshold * 100)}
                    onChange={(e) => setThreshold(Number(e.target.value) / 100)}
                    className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between mt-3 text-[10px] font-bold text-text-muted">
                    <span>{t(lang, "soft")}</span>
                    <span className={thresholdLabel === t(lang, "normal") ? "text-primary" : ""}>
                      {thresholdLabel} ({threshold.toFixed(2)})
                    </span>
                    <span>{t(lang, "strict")}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-4 flex items-center">
                  {t(lang, "threads")} (max: {maxThreads})
                  <HelpTooltip lang={lang} titleKey="threadsHelpTitle" descKey="threadsHelpDesc" position="tooltip-bottom" />
                </h3>
                <div className="flex p-1 bg-surface border border-border rounded-lg">
                  {threadOptions.map((n) => (
                    <button
                      key={n}
                      onClick={() => setThreads(n)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                        threads === n ? "bg-primary text-white" : "hover:bg-primary/20"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

                {/* Settings Toggles */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-4 flex items-center">
                    {t(lang, "additionalSettings")}
                    <HelpTooltip lang={lang} titleKey="additionalSettingsHelpTitle" descKey="additionalSettingsHelpDesc" position="tooltip-top" />
                  </h3>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                    {([
                      ["recursive", "recursive"],
                      ["logFile", "logFile"],
                      ["processVideo", "processVideo"],
                      ["exifCorrection", "exifCorrection"],
                    ] as [keyof typeof config, LangKey][]).map(([key, labelKey]) => (
                      <label key={key} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="toggle-switch"
                          checked={!!config[key]}
                          onChange={(e) => updateConfig({ [key]: e.target.checked })}
                        />
                        <span className="text-sm font-medium">{t(lang, labelKey)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

        {/* Results Grid */}
        {activeTab === "results" && (
          <div className="space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-5 rounded-xl bg-primary/10 border border-primary/30 text-center">
                <p className="text-3xl font-bold text-primary">{progress.total || stats.total || 0}</p>
                <p className="text-[10px] font-bold text-primary/70 uppercase mt-1">{t(lang, "totalPhotos")}</p>
              </div>
              <div className="p-5 rounded-xl bg-surface/50 border border-border/30 text-center">
                <p className="text-3xl font-bold text-text">{stats.processed || stats.total || 0}</p>
                <p className="text-[10px] font-bold text-text-muted uppercase mt-1">{t(lang, "processed")}</p>
              </div>
              <div className="p-5 rounded-xl bg-surface/50 border border-border/30 text-center">
                <p className="text-3xl font-bold text-text">{elapsedTime}</p>
                <p className="text-[10px] font-bold text-text-muted uppercase mt-1">{t(lang, "timeElapsed")}</p>
              </div>
            </div>

            <div className="border-t border-border/20" />

            {/* Category Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-surface/50 border border-border/30 text-center">
                <p className="text-2xl font-bold text-cyan-400">{stats.solo || 0}</p>
                <p className="text-[10px] font-bold text-text-muted uppercase mt-1">
                  {persons.length > 1 ? t(lang, "soloMulti" as any) : t(lang, "solo")}
                </p>
              </div>

              {persons.length > 1 && (
                <div className="p-4 rounded-xl bg-surface/50 border border-primary/20 text-center">
                  <p className="text-2xl font-bold text-pink-400">{stats.together || 0}</p>
                  <p className="text-[10px] font-bold text-primary/70 uppercase mt-1">
                    {t(lang, "together" as any)}
                  </p>
                </div>
              )}

              {([
                ["group", stats.group || 0, "text-violet-400"],
                ["othersLabel", stats.others || 0, "text-orange-400"],
                ["noFaces", stats.no_people || 0, "text-text-muted"],
                ["duplicatesLabel", stats.duplicates || 0, "text-teal-400"],
                ["unrecognizedLabel", stats.unrecognized || 0, "text-text-muted"],
                ["smallLabel", stats.small || 0, "text-amber-300"],
                ["junkLabel", stats.junk || 0, "text-warning"],
                ["errors", stats.errors || 0, "text-danger"],
              ] as [LangKey, number, string][]).map(([key, value, color]) => (
                <div key={key} className="p-4 rounded-xl bg-surface/50 border border-border/30 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] font-bold text-text-muted uppercase mt-1">{t(lang, key)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions with gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none h-28 bg-linear-to-t from-bg-dark via-bg-dark/80 to-transparent" />
      <div className="absolute bottom-6 left-0 right-0 px-6 z-10">
        {phase === "idle" || phase === "done" ? (
          <button
            onClick={handleStart}
            disabled={!canStart && phase !== "done"}
            className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] cursor-pointer ${
              canStart || phase === "done"
                ? "bg-primary hover:bg-primary-hover text-white shadow-2xl shadow-primary/40"
                : "bg-surface border border-border text-text-dim cursor-not-allowed"
            }`}
          >
            <span className="icon">play_arrow</span>
            {t(lang, "startSorting")}
          </button>
        ) : (
          <div className="flex gap-3 mb-2">
            <button
              onClick={isPaused ? handleResume : handlePause}
              className="flex-1 bg-warning hover:bg-amber-600 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-warning/20"
            >
              <span className="icon">{isPaused ? "play_arrow" : "pause"}</span>
              {isPaused ? t(lang, "resume") : t(lang, "pause")}
            </button>
            <button
              onClick={handleStop}
              className="flex-1 bg-danger hover:bg-red-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-danger/20"
            >
              <span className="icon">stop</span>
              {t(lang, "stop")}
            </button>
          </div>
        )}

        {/* Progress Bar under buttons */}
        {(isRunning || isPaused) && progress.total > 0 && (
          <div className="w-full mt-3">
            <div className="w-full bg-border/40 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-[9px] font-bold text-text-muted text-center mt-1.5 uppercase tracking-widest">
              {progress.current} / {progress.total}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
