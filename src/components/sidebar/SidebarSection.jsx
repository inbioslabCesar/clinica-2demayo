import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@fluentui/react";

export default function SidebarSection({
  title,
  iconName,
  children,
  defaultOpen = false,
  isOpen,
  onToggle,
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef(null);
  const open = useMemo(() => {
    if (typeof isOpen === "boolean") return isOpen;
    return internalOpen;
  }, [isOpen, internalOpen]);

  const measureContentHeight = () => {
    if (!contentRef.current) return;
    setContentHeight(contentRef.current.scrollHeight);
  };

  useEffect(() => {
    measureContentHeight();
  }, [children, open]);

  useEffect(() => {
    if (!contentRef.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      measureContentHeight();
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const handleToggle = () => {
    if (typeof onToggle === "function") {
      onToggle();
      return;
    }
    setInternalOpen((prev) => !prev);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 font-semibold text-slate-800">
          <Icon iconName={iconName || "BulletedList"} className="text-slate-600" />
          {title}
        </span>
        <Icon
          iconName={open ? "ChevronDown" : "ChevronRight"}
          className="text-slate-500"
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: open ? `${contentHeight}px` : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="pb-2 pl-5 pr-2 flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}
