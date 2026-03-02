import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../stores/appStore";
import { t } from "../lib/i18n";

interface InfoModalProps {
  onClose: () => void;
}

export function InfoModal({ onClose }: InfoModalProps) {
  const { lang } = useAppStore();
  const [activeTab, setActiveTab] = useState(0);

  const sections = [
    { titleKey: "infoTitleIntro", descKey: "infoDescIntro", icon: "info" },
    { titleKey: "infoTitle1", descKey: "infoDesc1", icon: "security" },
    { titleKey: "infoTitle2", descKey: "infoDesc2", icon: "face" },
    { titleKey: "infoTitle3", descKey: "infoDesc3", icon: "folder" },
    { titleKey: "infoTitle4", descKey: "infoDesc4", icon: "filter_alt" },
    { titleKey: "infoTitle5", descKey: "infoDesc5", icon: "tune" },
  ];

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-bg-dark/80 backdrop-blur-md animate-fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div 
        className="w-full max-w-4xl h-[80vh] bg-surface rounded-2xl shadow-2xl border border-border/50 flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-bg-dark/20 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <span className="icon text-primary text-2xl">menu_book</span>
            <h2 className="text-lg font-bold">{t(lang, "howItWorks")}</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary uppercase tracker-wider">
              Local AI Guide
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface hover:bg-bg-dark border border-border/50 text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <span className="icon text-sm">close</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Menu */}
          <div className="w-64 border-r border-border/50 p-4 bg-bg-dark/10 overflow-y-auto">
            <nav className="flex flex-col gap-2">
              {sections.map((section, index) => {
                const isActive = activeTab === index;
                return (
                  <button
                    key={index}
                    onClick={() => setActiveTab(index)}
                    className={`nav-btn p-3 rounded-lg text-left flex items-start gap-3 transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                        : "text-text-dim hover:bg-surface/50 border border-transparent"
                    }`}
                  >
                    <span className={`icon shrink-0 mt-0.5 ${isActive ? "text-primary" : "text-text-muted"}`}>
                      {section.icon}
                    </span>
                    <span className={`text-sm font-semibold leading-tight ${isActive ? "text-primary" : "text-text"}`}>
                      {t(lang, section.titleKey as any)}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col items-start justify-start">
            <div className="max-w-3xl w-full space-y-6 animate-fade-in" key={activeTab}>
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 shadow-inner ring-1 ring-primary/20">
                <span className="icon text-3xl text-primary">{sections[activeTab].icon}</span>
              </div>
              <h3 className="text-3xl font-bold text-text">
                {t(lang, sections[activeTab].titleKey as any)}
              </h3>
              <p className="text-base text-text-muted leading-relaxed whitespace-pre-wrap">
                {t(lang, sections[activeTab].descKey as any)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
