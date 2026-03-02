import { t, type LangKey, type Lang } from "../lib/i18n";

interface HelpTooltipProps {
  lang: Lang;
  titleKey: LangKey;
  descKey: LangKey;
  position?: "tooltip-top" | "tooltip-bottom" | "tooltip-right" | "tooltip-bottom-right";
  className?: string;
}

export function HelpTooltip({ lang, titleKey, descKey, position = "tooltip-top", className = "" }: HelpTooltipProps) {
  return (
    <div className={`has-tooltip ml-1.5 inline-flex items-center align-middle ${className}`}>
      <span className="icon text-[14px] text-text-dim hover:text-primary cursor-help transition-colors select-none">
        help_outline
      </span>
      <div className={`tooltip ${position}`}>
        <div className="font-bold text-primary mb-1.5 flex items-center gap-2">
          <span className="icon text-[12px]">info</span>
          {t(lang, titleKey)}
        </div>
        <div className="whitespace-pre-line text-text-muted leading-relaxed">
          {t(lang, descKey)}
        </div>
      </div>
    </div>
  );
}
