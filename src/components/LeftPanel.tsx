import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { t } from "../lib/i18n";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { addReference, removeReference, clearAllReferences, stopSorting } from "../lib/ipc";
import { convertFileSrc } from "@tauri-apps/api/core";
import { HelpTooltip } from "./HelpTooltip";

const TreeItem = ({ icon, label, indent = 0, color = "text-text-muted", isTrash = false, trashLabel = "", onClick }: { icon: string, label: string, indent?: number, color?: string, isTrash?: boolean, trashLabel?: string, onClick?: () => void }) => (
  <div onDoubleClick={onClick} className={`flex items-center gap-2 py-0.5 select-none ${onClick ? 'cursor-pointer hover:bg-surface/50 rounded transition-colors' : ''}`} style={{ paddingLeft: `${indent * 1.25}rem` }}>
    {indent > 0 && <div className="w-4 h-px bg-text-dim/60 -ml-3 mr-1" />}
    <span className={`icon text-[14px] ${color}`}>{icon}</span>
    <span className="text-[12px] truncate capitalize flex items-center gap-2">
      {label}
      {isTrash && <span className="text-[10px] text-danger/80 lowercase italic">— {trashLabel}</span>}
    </span>
  </div>
);


const FolderNode = ({ node, indent, basePath, openResultFolder }: { 
  node: { name: string; count: number; children: any[] }; 
  indent: number; 
  basePath: string; 
  openResultFolder: (sub: string) => void 
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isYear = /^\d{4}$/.test(node.name);
  const icon = isYear ? "folder_open" : hasChildren ? "folder" : "folder_open";
  const label = node.count > 0 ? `${node.name} (${node.count})` : node.name;
  
  return (
    <div>
      <TreeItem 
        onClick={() => openResultFolder(node.name)} 
        icon={icon} 
        label={label} 
        indent={indent} 
        color={isYear ? "text-text-muted" : "text-text"} 
      />
      {hasChildren && (
        <div className="ml-3 border-l border-text-dim/60 pl-0">
          {node.children.map((child: any) => (
            <FolderNode 
              key={child.name} 
              node={child} 
              indent={1} 
              basePath={`${basePath}\\${node.name}`}
              openResultFolder={(sub) => openResultFolder(`${node.name}/${sub}`)} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function LeftPanel() {
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [isDeletePresetModalOpen, setIsDeletePresetModalOpen] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");

  const {
    references, addReference: addRef, removeReference: removeRef,
    clearReferences,
    persons, selectedPersonId, addPerson, removePerson, setSelectedPerson,
    sourceFolder, targetFolder, sourceFileCount, config,
    setSourceFolder, setTargetFolder, lang, phase, stats,
    presets, activePresetId, savePreset, loadPreset, deletePreset,
    resetSession
  } = useAppStore();

  // Show only the selected person's refs
  const selectedPerson = persons.find(p => p.id === selectedPersonId);
  const visibleRefs = selectedPerson
    ? references.filter(r => selectedPerson.referenceIds.includes(r.id))
    : references;

  const handleReset = async () => {
    if (phase !== "idle" && phase !== "done") {
      try { await stopSorting(); } catch {}
    }
    resetSession();
  };

  const prevPresetIdRef = useRef<string | null>(null);

  // When user switches presets, reload reference photos
  useEffect(() => {
    if (prevPresetIdRef.current === activePresetId) return;
    const prevId = prevPresetIdRef.current;
    prevPresetIdRef.current = activePresetId;
    
    if (!activePresetId) {
      // Switching to default: clear Python engine references
      if (prevId !== null) {
        const clearAll = async () => {
          try { await clearAllReferences(); } catch {}
        };
        clearAll();
      }
      return;
    }
    const preset = presets.find(p => p.id === activePresetId);
    if (!preset || !preset.persons || preset.persons.length === 0) return;

    const allPresetPaths = preset.persons.flatMap(p => p.referencePaths).sort().join(",");
    const currentPaths = references.map(r => r.path).sort().join(",");
    if (currentPaths === allPresetPaths) return;

    const loadRefs = async () => {
      // Wipe ALL references from Python engine first
      try { await clearAllReferences(); } catch {}
      clearReferences();

      for (const person of preset.persons) {
        for (const filePath of person.referencePaths) {
          try {
            const result = await addReference(filePath, person.id);
            if (result.status === "ok" && result.reference_id) {
              addRef({
                id: result.reference_id,
                path: filePath,
                thumbnailUrl: convertFileSrc(filePath),
                hasFace: true,
                hasMultipleFaces: result.has_multiple_faces || false,
                slotId: person.id,
              }, true); // autoLink to the person in state
            }
          } catch (err) {
            console.error("Failed to reload reference from preset:", err);
          }
        }
      }
    };
    loadRefs();
  }, [activePresetId]);

  const openResultFolder = async (subPath: string) => {
    if (!targetFolder) return;
    try {
      const normalizedSub = subPath.replace(/\//g, "\\");
      const fullPath = `${targetFolder}\\${normalizedSub}`;
      console.log("Opening folder:", fullPath);
      await openPath(fullPath);
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  const handleAddReference = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "webp", "heic"] }],
    });
    if (!selected) return;
    const files = Array.isArray(selected) ? selected : [selected];

    for (const filePath of files) {
      try {
        const result = await addReference(filePath, selectedPersonId || "default");
        if (result.status === "ok" && result.reference_id) {
          addRef({
            id: result.reference_id,
            path: filePath,
            thumbnailUrl: convertFileSrc(filePath),
            hasFace: true,
            hasMultipleFaces: result.has_multiple_faces || false,
            slotId: selectedPersonId || "default",
          });
          setRefError(null);
        }
      } catch (err: any) {
        const fileName = filePath.split("\\").pop() || filePath;
        setRefError(lang === "uk" ? `Обличчя не знайдено: ${fileName}` : lang === "ru" ? `Лицо не найдено: ${fileName}` : `No face found: ${fileName}`);
        setTimeout(() => setRefError(null), 5000);
        console.error("Failed to add reference:", err);
      }
    }
  };

  const handleRemoveReference = async (id: string) => {
    try {
      await removeReference(id);
      removeRef(id);
    } catch (err) {
      console.error("Failed to remove reference:", err);
    }
  };

  const handleSelectSource = async () => {
    const selected = await open({ directory: true, title: t(lang, "selectSourceFolder") });
    if (selected) setSourceFolder(selected as string, 0);
  };

  const handleSelectTarget = async () => {
    const selected = await open({ directory: true, title: t(lang, "selectTargetFolder") });
    if (selected) setTargetFolder(selected as string);
  };

  const renderMatches = (indent: number) => {
    if (!config.splitSoloGroup) {
      return <TreeItem icon="face" label={t(lang, "matched")} indent={indent} color="text-primary" />;
    }

    return (
      <>
        {persons.length === 0 ? (
          <TreeItem icon="person" label={t(lang, "solo")} indent={indent} color="text-cyan-400" />
        ) : (
          persons.map(p => (
            <TreeItem key={p.id} icon="person" label={p.name} indent={indent} color="text-cyan-400" />
          ))
        )}
        {persons.length > 1 && (
          <TreeItem icon="people" label={t(lang, "together")} indent={indent} color="text-pink-400" />
        )}
        <TreeItem icon="groups" label={t(lang, "group")} indent={indent} color="text-violet-400" />
      </>
    );
  };

  return (
    <section className="w-[40%] border-r border-border/30 flex flex-col bg-bg-dark/20 h-full overflow-hidden">
      {/* Reference Photos */}
      <div className="px-4 pt-4 pb-4 shrink-0">
        {/* Person Cards Row */}
        <h3 className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-2 flex items-center">
              {t(lang, "people")}
              <HelpTooltip lang={lang} titleKey="peopleHelpTitle" descKey="peopleHelpDesc" position="tooltip-bottom-right" />
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-3">
              {persons.map((person) => {
                const personRefs = references.filter(r => person.referenceIds.includes(r.id));
                const previewRef = personRefs[0];
                const isSelected = selectedPersonId === person.id;
                return (
                  <div
                    key={person.id}
                    onClick={() => setSelectedPerson(person.id)}
                    className={`relative min-w-[80px] rounded-lg overflow-hidden shrink-0 border-2 cursor-pointer transition-all group ${
                      isSelected ? "border-primary shadow-lg shadow-primary/20" : "border-border hover:border-text-muted"
                    }`}
                  >
                    <div className="h-[60px] bg-surface flex items-center justify-center">
                      {previewRef ? (
                        <img src={previewRef.thumbnailUrl} alt={person.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="icon text-2xl text-text-dim">person_add_alt</span>
                      )}
                    </div>
                    <div className="h-[28px] px-1.5 py-1 bg-surface/90 text-center flex flex-col justify-center">
                      <div className="text-[10px] font-bold text-text truncate">{person.name}</div>
                      <div className="text-[9px] text-text-muted leading-tight">{personRefs.length} {lang === "uk" ? "фото" : lang === "ru" ? "фото" : "photos"}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removePerson(person.id); }}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
          <button
            onClick={() => setIsPersonModalOpen(true)}
            className="min-w-[80px] h-[92px] rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-text-dim hover:border-primary hover:text-primary transition-all cursor-pointer shrink-0"
          >
            <span className="icon">person_add</span>
            <span className="text-[9px] font-bold mt-1">{t(lang, "addPerson")}</span>
          </button>
        </div>

        <h3 className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-3 flex items-center">
          {t(lang, "referenceTargets")}
          <HelpTooltip lang={lang} titleKey="refTargetsHelpTitle" descKey="refTargetsHelpDesc" position="tooltip-bottom-right" />
          {selectedPersonId && (
            <span className="text-primary normal-case ml-2">
              — {persons.find(p => p.id === selectedPersonId)?.name}
            </span>
          )}
        </h3>
        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {visibleRefs.map((ref) => (
            <div
              key={ref.id}
              className={`relative min-w-[68px] h-[84px] rounded-lg overflow-hidden group shrink-0 border-2 ${
                ref.hasMultipleFaces ? "border-warning" : "border-primary"
              }`}
            >
              <img
                src={ref.thumbnailUrl}
                alt="Reference"
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <div className="absolute top-1 right-1 bg-primary text-white rounded-full p-0.5 scale-75">
                <span className="icon" style={{ fontSize: 14 }}>check</span>
              </div>
              <button
                onClick={() => handleRemoveReference(ref.id)}
                className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={handleAddReference}
            disabled={!selectedPersonId}
            className={`min-w-[68px] h-[84px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-all shrink-0 ${
              !selectedPersonId
                ? "border-border/30 text-text-dim/30 cursor-not-allowed"
                : "border-border text-text-dim hover:border-primary hover:text-primary cursor-pointer"
            }`}
          >
            <span className="icon">add</span>
            <span className="text-[10px] font-bold">{t(lang, "add")}</span>
          </button>
        </div>

        {/* No face detected error */}
        {refError && (
          <div className="mt-1 px-3 py-2 bg-danger/10 border border-danger/30 rounded-lg text-[11px] text-danger flex items-center gap-2">
            <span className="icon text-sm">error</span>
            {refError}
          </div>
        )}

        {!selectedPersonId && persons.length > 0 && (
          <div className="mt-1 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg text-[11px] text-primary flex items-center gap-2">
            <span className="icon text-sm">info</span>
            {t(lang, "selectPersonHint")}
          </div>
        )}
        {persons.length === 0 && (
          <div className="mt-1 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg text-[11px] text-primary flex items-center gap-2">
            <span className="icon text-sm">info</span>
            {t(lang, "addPersonHint")}
          </div>
        )}
      </div>

      {/* Presets */}
      <div className="px-4 py-3 border-t border-border/20 shrink-0">
        <label className="text-[11px] font-bold text-text-dim uppercase tracking-widest mb-2 flex justify-between items-center">
          {t(lang, "activePreset")}
          {sourceFileCount > 0 && (
            <span className="text-primary normal-case tracking-normal">{sourceFileCount} {t(lang, "filesDetected")}</span>
          )}
        </label>
        <div className="flex items-stretch gap-2 h-9">
          <select 
            value={activePresetId || ""}
            onChange={(e) => loadPreset(e.target.value || null)}
            className="flex-1 appearance-none bg-surface border border-border rounded-lg text-sm text-text pl-3 pr-8 focus:ring-primary focus:border-primary outline-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: "right 0.75rem center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "1.25em 1.25em",
            }}
          >
            <option value="">{t(lang, "defaultPreset")}</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button 
            onClick={handleReset}
            disabled={phase === "idle"}
            title={t(lang, "resetResults")}
            className={`w-12 flex items-center justify-center bg-surface border border-border rounded-lg transition-colors ${phase !== "idle" ? 'text-text-muted hover:text-primary cursor-pointer' : 'text-text-dim opacity-50 cursor-not-allowed'}`}
          >
            <span className="icon text-lg">restart_alt</span>
          </button>
          <button 
            onClick={() => setIsPresetModalOpen(true)}
            className="w-12 flex items-center justify-center bg-surface border border-border rounded-lg text-text-muted hover:text-success transition-colors cursor-pointer"
          >
            <span className="icon text-lg">save</span>
          </button>
          <button 
            onClick={() => setIsDeletePresetModalOpen(true)}
            disabled={!activePresetId}
            className={`w-12 flex items-center justify-center bg-surface border border-border rounded-lg transition-colors ${activePresetId ? 'text-text-muted hover:text-danger cursor-pointer' : 'text-text-dim opacity-50 cursor-not-allowed'}`}
          >
            <span className="icon text-lg">delete</span>
          </button>
        </div>
      </div>

      {/* Preset Custom Modal */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface border border-border/50 rounded-2xl p-7 shadow-2xl w-[460px] shadow-black/50 transform transition-all animate-in zoom-in-95 duration-200 flex flex-col gap-6">
            
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-text tracking-tight mb-1">
                  {t(lang, "savePreset")}
                </h3>
                <p className="text-[11px] text-text-muted">
                  {t(lang, "savePresetDesc")}
                </p>
              </div>
              <button 
                onClick={() => { setIsPresetModalOpen(false); setNewPresetName(""); }}
                className="text-text-muted hover:text-text p-1 transition-colors bg-bg-dark/50 hover:bg-bg-dark rounded-md border border-transparent hover:border-border/50 cursor-pointer"
              >
                <span className="icon text-lg">close</span>
              </button>
            </div>
            
            <div className="flex flex-col gap-5">
              {/* Preset Name Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-text-muted tracking-wide ml-1">
                  {t(lang, "presetName")}
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="w-full bg-bg-dark border border-border rounded-xl px-4 py-3 text-sm text-text font-medium focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-text-dim pr-10"
                    placeholder={t(lang, "presetNamePlaceholder")}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newPresetName.trim()) {
                        savePreset(newPresetName.trim());
                        setIsPresetModalOpen(false);
                        setNewPresetName("");
                      } else if (e.key === "Escape") {
                        setIsPresetModalOpen(false);
                        setNewPresetName("");
                      }
                    }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-primary opacity-80 pointer-events-none">
                    <span className="icon text-lg">edit</span>
                  </span>
                </div>
              </div>

              {/* Existing Presets List */}
              {presets.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1 border-t border-border/20 pt-4">
                  <div className="flex justify-between items-end mb-1 ml-1 mr-1">
                    <label className="text-[12px] font-bold text-text-muted tracking-wide">
                      {t(lang, "existingPresets")}
                    </label>
                    <span className="text-[10px] text-text-dim">
                      {t(lang, "selectToOverwrite")}
                    </span>
                  </div>
                  
                  <div className="flex flex-col max-h-[260px] overflow-y-auto custom-scrollbar gap-1.5 pr-1">
                    {presets.map(p => {
                      const isSelected = newPresetName === p.name;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setNewPresetName(p.name)}
                          className={`flex items-center gap-3 text-left w-full px-3 py-2 rounded-xl transition-all border cursor-pointer group ${
                            isSelected 
                              ? 'bg-primary/5 border-primary shadow-inner shadow-primary/5' 
                              : 'bg-bg-dark/50 border-border/40 hover:border-text-muted/50 hover:bg-bg-dark'
                          }`}
                        >
                          <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center bg-surface ${
                            isSelected ? 'text-primary border border-primary/20' : 'text-text-muted border border-border/50 group-hover:text-text'
                          }`}>
                            <span className="icon text-[14px]">folder_copy</span>
                          </div>
                          <div className="flex-1 truncate">
                            <div className={`text-[13px] font-bold truncate ${isSelected ? 'text-primary' : 'text-text group-hover:text-primary transition-colors'}`}>
                              {p.name}
                            </div>
                          </div>
                          
                          {/* Radio Button approach exactly like image */}
                          <div className={`shrink-0 w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
                            isSelected ? 'border-primary bg-primary/20' : 'border-border group-hover:border-text-muted/50'
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Overwrite warning exactly like image */}
            {newPresetName.trim() && presets.some(p => p.name === newPresetName.trim()) && (
              <div className="flex items-start gap-3 px-4 py-3.5 bg-warning/5 border border-warning/20 rounded-xl mt-[-4px]">
                <span className="icon text-warning/80 text-[18px] shrink-0 font-light mt-[2px]">warning</span>
                <p className="text-[11px] text-warning/90 leading-snug">
                  <><strong>{t(lang, "warningLabel")}</strong> {t(lang, "overwriteWarning")} "{newPresetName.trim()}"</>
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => {
                  setIsPresetModalOpen(false);
                  setNewPresetName("");
                }}
                className="px-6 py-2.5 text-xs font-bold text-text-muted hover:text-text bg-transparent border border-border/60 hover:border-text-muted/50 hover:bg-surface rounded-xl transition-all cursor-pointer"
              >
                {t(lang, "cancel")}
              </button>
              <button
                onClick={() => {
                  if (newPresetName.trim()) {
                    savePreset(newPresetName.trim());
                    setIsPresetModalOpen(false);
                    setNewPresetName("");
                  }
                }}
                disabled={!newPresetName.trim()}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-bg-dark rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
                  presets.some(p => p.name === newPresetName.trim()) 
                    ? 'bg-warning hover:bg-yellow-400 shadow-lg shadow-warning/20' 
                    : 'bg-primary hover:bg-primary-hover shadow-lg shadow-primary/20 text-white'
                }`}
              >
                <span className="icon text-[16px]">save</span>
                {presets.some(p => p.name === newPresetName.trim()) 
                  ? t(lang, "overwrite")
                  : t(lang, "savePreset")
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Preset Confirmation Modal */}
      {isDeletePresetModalOpen && activePresetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface border border-danger/40 rounded-2xl p-7 shadow-2xl w-[400px] shadow-danger/10 transform transition-all animate-in zoom-in-95 duration-200 flex flex-col gap-5">
            
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex shrink-0 items-center justify-center text-danger mt-1">
                <span className="icon text-[24px]">delete_forever</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-text tracking-tight mb-1.5">
                  {t(lang, "deletePresetTitle")}
                </h3>
                <p className="text-[13px] text-text-muted leading-relaxed">
                  {`${t(lang, "deletePresetConfirm")} "${presets.find(p => p.id === activePresetId)?.name}"`}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-3 border-t border-border/20 pt-5">
              <button
                onClick={() => setIsDeletePresetModalOpen(false)}
                className="px-6 py-2.5 text-xs font-bold text-text-muted hover:text-text bg-transparent border border-border/60 hover:border-text-muted/50 hover:bg-surface rounded-xl transition-all cursor-pointer"
              >
                {t(lang, "cancel")}
              </button>
              <button
                onClick={() => {
                  deletePreset(activePresetId);
                  setIsDeletePresetModalOpen(false);
                }}
                className="flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-linear-to-r from-danger to-red-600 hover:to-red-500 rounded-xl transition-all cursor-pointer active:scale-95 shadow-lg shadow-danger/20"
              >
                <span className="icon text-[16px]">delete</span>
                {t(lang, "delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Person Name Modal */}
      {isPersonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-sm">
          <div className="bg-surface border border-border/50 rounded-xl p-6 shadow-2xl w-[320px]">
            <h3 className="text-sm font-bold text-text mb-4">
              {t(lang, "enterPersonName")}
            </h3>
            <input
              type="text"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary mb-5"
              placeholder={t(lang, "personNamePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPersonName.trim()) {
                  addPerson(newPersonName.trim());
                  setIsPersonModalOpen(false);
                  setNewPersonName("");
                } else if (e.key === "Escape") {
                  setIsPersonModalOpen(false);
                  setNewPersonName("");
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setIsPersonModalOpen(false);
                  setNewPersonName("");
                }}
                className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text hover:bg-border/20 rounded-lg transition-colors cursor-pointer"
              >
                {t(lang, "cancel")}
              </button>
              <button
                onClick={() => {
                  if (newPersonName.trim()) {
                    addPerson(newPersonName.trim());
                    setIsPersonModalOpen(false);
                    setNewPersonName("");
                  }
                }}
                disabled={!newPersonName.trim()}
                className="px-4 py-2 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {t(lang, "addPerson")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Tree Preview */}
      <div className="flex-1 flex flex-col px-4 py-3 border-t border-border/20 min-h-0">
        <div className="flex gap-2 mb-3 shrink-0">
          <button
            onClick={handleSelectSource}
            className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all cursor-pointer ${
              sourceFolder ? "bg-surface border-success text-success font-bold" : "bg-transparent border-primary text-primary hover:bg-primary/10"
            }`}
          >
            <span className="icon icon-sm">folder_open</span>
            <span className="truncate text-xs">{sourceFolder ? sourceFolder.split('\\').pop() : t(lang, "source")}</span>
          </button>
          <button
            onClick={handleSelectTarget}
            className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all cursor-pointer ${
              targetFolder ? "bg-surface border-success text-success font-bold" : "bg-transparent border-primary text-primary hover:bg-primary/10"
            }`}
          >
            <span className="icon icon-sm">drive_file_move</span>
            <span className="truncate text-xs">{targetFolder ? targetFolder.split('\\').pop() : t(lang, "result")}</span>
          </button>
        </div>

        <h3 className="relative z-10 text-[11px] font-bold text-text-dim uppercase tracking-widest mb-2 mt-1 shrink-0 flex items-center">
          {phase === "done" ? t(lang, "resultsTab") : t(lang, "folderStructure")}
          <HelpTooltip lang={lang} titleKey="infoTitle3" descKey="infoDesc3" position="tooltip-bottom-right" />
        </h3>

        <div className="flex-1 bg-surface/30 rounded-lg border border-border/30 overflow-y-auto custom-scrollbar p-3 font-mono">
          <div className="flex items-center gap-2 text-text mb-2">
            <span className="icon icon-sm text-text-muted">account_tree</span>
            <span className="font-medium text-sm">
              {t(lang, "resultFolder")}
            </span>
          </div>

          <div className="relative border-l border-text-dim/60 ml-2 py-1 space-y-1.5 min-h-[50px]">
            {phase === "done" ? (
              <>
                {stats.folder_tree && stats.folder_tree.length > 0 ? (
                  stats.folder_tree.map((node) => (
                    <FolderNode key={node.name} node={node} indent={1} basePath={targetFolder} openResultFolder={openResultFolder} />
                  ))
                ) : (
                  /* Fallback flat if no tree data */
                  <>
                    {stats.solo > 0 && <TreeItem onClick={() => openResultFolder(t(lang, "solo"))} icon="person" label={`${t(lang, "solo")} (${stats.solo})`} indent={1} color="text-cyan-400" />}
                    {stats.group > 0 && <TreeItem onClick={() => openResultFolder(t(lang, "group"))} icon="groups" label={`${t(lang, "group")} (${stats.group})`} indent={1} color="text-violet-400" />}
                    {stats.others > 0 && <TreeItem onClick={() => openResultFolder(t(lang, "othersLabel"))} icon="groups" label={`${t(lang, "othersLabel")} (${stats.others})`} indent={1} color="text-orange-400" />}
                    {stats.no_people > 0 && <TreeItem onClick={() => openResultFolder(t(lang, "noFaces"))} icon="image" label={`${t(lang, "noFaces")} (${stats.no_people})`} indent={1} color="text-text-muted" />}
                    {stats.duplicates > 0 && <TreeItem onClick={() => openResultFolder(t(lang, "duplicatesLabel"))} icon="file_copy" label={`${t(lang, "duplicatesLabel")} (${stats.duplicates})`} indent={1} color="text-teal-400" />}
                    {stats.small > 0 && <TreeItem onClick={() => openResultFolder(t(lang, "smallFiles"))} icon="architecture" label={`${t(lang, "smallFiles")} (${stats.small})`} indent={1} color="text-text-muted" />}
                    {stats.junk > 0 && <TreeItem onClick={() => openResultFolder(t(lang, "junkLabel"))} icon="delete" label={`${t(lang, "junkLabel")} (${stats.junk})`} indent={1} color="text-warning" isTrash trashLabel={t(lang, "junkNotDeleted")} />}
                  </>
                )}
              </>
            ) : (
              <>
                {config.sortByYear ? (
                  <>
                    <TreeItem icon="folder_open" label={new Date().getFullYear().toString()} indent={1} color="text-text-muted" />
                    {renderMatches(2)}
                    {config.collectNoPeople && <TreeItem icon="image" label={t(lang, "noFaces")} indent={2} color="text-text-muted" />}
                    {config.collectOthers && <TreeItem icon="groups" label={t(lang, "othersLabel")} indent={2} color="text-text-muted" />}
                    {config.collectSmall && <TreeItem icon="architecture" label={t(lang, "smallFiles")} indent={2} color="text-text-muted" />}
                    {config.collectJunk && <TreeItem icon="delete" label={t(lang, "junkLabel")} indent={2} color="text-text-muted" isTrash trashLabel={t(lang, "junkNotDeleted")} />}
                    {config.detectDuplicates && <TreeItem icon="file_copy" label={t(lang, "duplicatesLabel")} indent={2} color="text-text-muted" />}
                    {config.collectUnrecognized && <TreeItem icon="help" label={t(lang, "unrecognizedLabel")} indent={2} color="text-text-muted" />}
                    <TreeItem icon="more_horiz" label="..." indent={1} color="text-text-muted" />
                  </>
                ) : (
                  <>
                    {renderMatches(1)}
                    {config.collectNoPeople && <TreeItem icon="image" label={t(lang, "noFaces")} indent={1} color="text-text-muted" />}
                    {config.collectOthers && <TreeItem icon="groups" label={t(lang, "othersLabel")} indent={1} color="text-text-muted" />}
                    {config.collectSmall && <TreeItem icon="architecture" label={t(lang, "smallFiles")} indent={1} color="text-text-muted" />}
                    {config.collectJunk && <TreeItem icon="delete" label={t(lang, "junkLabel")} indent={1} color="text-text-muted" isTrash trashLabel={t(lang, "junkNotDeleted")} />}
                    {config.detectDuplicates && <TreeItem icon="file_copy" label={t(lang, "duplicatesLabel")} indent={1} color="text-text-muted" />}
                    {config.collectUnrecognized && <TreeItem icon="help" label={t(lang, "unrecognizedLabel")} indent={1} color="text-text-muted" />}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
