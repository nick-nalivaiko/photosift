import { useAppStore } from "../stores/appStore";
import { t } from "../lib/i18n";

export function StatusBar() {
  const { phase, sourceFileCount, stats, lang } = useAppStore();

  const statusText = (() => {
    switch (phase) {
      case "idle": return t(lang, "systemReady");
      case "scanning": return t(lang, "initializing");
      case "analysis": return t(lang, "analyzing");
      case "copying": return t(lang, "copying");
      case "done": return t(lang, "completed");
      case "paused": return t(lang, "paused");
      case "stopped": return t(lang, "stopped");
      default: return "";
    }
  })();

  const statusColor = (() => {
    switch (phase) {
      case "idle": case "done": return "bg-success";
      case "analysis": case "scanning": case "copying": return "bg-primary";
      case "paused": return "bg-warning";
      case "stopped": return "bg-danger";
      default: return "bg-text-muted";
    }
  })();

  const isAnimating = phase === "analysis" || phase === "scanning" || phase === "copying";

  return (
    <footer className="h-7 min-h-7 bg-surface border-t border-border/50 px-4 flex items-center justify-between text-[11px] font-medium text-text-muted">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor} ${isAnimating ? "animate-pulse" : ""}`} />
          <span>{statusText}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        {sourceFileCount > 0 && (
          <span>{sourceFileCount} {t(lang, "filesDetected")}</span>
        )}
        {stats.matched > 0 && (
          <>
            <div className="h-3 w-px bg-border" />
            <span className="text-primary font-bold">{stats.matched} {t(lang, "matched").toLowerCase()}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="icon" style={{ fontSize: 14 }}>info</span>
      </div>
    </footer>
  );
}
