import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { t } from "../lib/i18n";
import { InfoModal } from "./InfoModal";
import logoSrc from "../assets/logo.png";

export function Header() {
  const { gpuAvailable, gpuName, lang, toggleLang, theme, toggleTheme } = useAppStore();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <header className="h-12 min-h-12 flex items-center justify-between px-4 bg-surface/50 border-b border-border/50 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <img src={logoSrc} alt="PhotoSift" className="h-7 object-contain" />
        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
          v0.1
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setShowInfo(true)}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface hover:bg-bg-dark border border-border/50 text-text-muted hover:text-primary transition-all duration-200 cursor-pointer"
          title={lang === "ru" ? "Как это работает" : lang === "uk" ? "Як це працює" : "How it works"}
        >
          <span className="icon text-[18px]">help_outline</span>
        </button>

        <div
          className={`flex items-center gap-2 px-3 py-1 rounded border ${
            gpuAvailable
              ? "bg-success/10 border-success/20"
              : "bg-warning/10 border-warning/20"
          }`}
        >
          <span className={`icon icon-sm ${gpuAvailable ? "text-success" : "text-warning"}`}>
            memory
          </span>
          <span className={`text-[11px] font-bold uppercase ${gpuAvailable ? "text-success" : "text-warning"}`}>
            {gpuAvailable ? `${t(lang, "gpuActive")}: ${gpuName}` : t(lang, "cpuOnly")}
          </span>
        </div>

        <button
          onClick={toggleLang}
          className="text-xs font-medium text-text-muted hover:text-primary transition-colors cursor-pointer"
        >
          {lang === "ru" ? "RU" : lang === "uk" ? "UK" : "EN"}
        </button>

        <button
          onClick={toggleTheme}
          className="icon text-text-muted hover:text-primary transition-all duration-200 cursor-pointer"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "light_mode" : "dark_mode"}
        </button>
      </div>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </header>
  );
}
