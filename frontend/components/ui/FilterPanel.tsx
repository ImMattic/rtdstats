"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CloseIcon } from "./FilterControls";
import { useIsPhone } from "@/lib/useMediaQuery";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Filter groups currently set — shown beside the title and gates Reset. */
  activeCount: number;
  onReset: () => void;
  onApply: () => void;
  applyLabel?: string;
  /** Result count for the pending draft, previewed on the Apply button. */
  applyHint?: string;
  /** Which edge of the anchor the desktop popover hangs from. */
  align?: "left" | "right" | "center";
  children: React.ReactNode;
}

/**
 * The filter menu surface.
 *
 * On a pointer device it is a popover hanging off the button that opened it; the
 * parent element must be positioned for that to anchor. On a phone it becomes a
 * bottom sheet portalled to `document.body`, because a popover that size ends up
 * either clipped by the map or too cramped to use with a thumb. Both share the
 * same header, scrolling body and sticky Reset/Apply footer.
 */
export default function FilterPanel({
  open,
  onClose,
  title,
  subtitle,
  activeCount,
  onReset,
  onApply,
  applyLabel = "Apply filters",
  applyHint,
  align = "right",
  children,
}: Props) {
  const isPhone = useIsPhone();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Outside-click dismissal is a desktop affordance; the sheet has a scrim.
  useEffect(() => {
    if (!open || isPhone) return;
    function onPointerDown(e: MouseEvent) {
      const el = panelRef.current;
      if (!el) return;
      const target = e.target as Node;
      // The button that opened us lives outside the panel — let it toggle
      // rather than closing here and immediately reopening.
      if (el.contains(target) || el.parentElement?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, isPhone, onClose]);

  // Stop the page behind the sheet from scrolling with it.
  useEffect(() => {
    if (!open || !isPhone) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, isPhone]);

  if (!open) return null;

  const header = (
    <div className="flex items-start gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
          {title}
          {activeCount > 0 && (
            <span
              key={activeCount}
              className="animate-badge-pop rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent-ink"
            >
              {activeCount}
            </span>
          )}
        </h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-fg-subtle">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close filters"
        className="press -mr-1 shrink-0 rounded-full p-1 text-fg-subtle transition-colors hover:bg-raised hover:text-fg"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center gap-2 border-t border-line bg-card px-4 py-3">
      <button
        type="button"
        onClick={onReset}
        disabled={activeCount === 0}
        className="press rounded-md border border-line px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        Reset
      </button>
      <button
        type="button"
        onClick={onApply}
        className="press flex-1 rounded-md bg-accent px-3 py-2 text-sm font-bold text-accent-ink transition-opacity hover:opacity-90"
      >
        {applyLabel}
        {applyHint && <span className="ml-1.5 font-medium opacity-80">{applyHint}</span>}
      </button>
    </div>
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">{children}</div>
  );

  if (isPhone && mounted) {
    return createPortal(
      <div className="fixed inset-0 z-[2000] flex flex-col justify-end">
        <button
          type="button"
          aria-label="Close filters"
          onClick={onClose}
          className="animate-scrim-in absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="animate-sheet-in relative flex max-h-[88vh] flex-col rounded-t-2xl border-t border-line bg-card shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <div className="flex justify-center pb-1 pt-2">
            <span className="h-1 w-10 rounded-full bg-line-strong" />
          </div>
          {header}
          {body}
          <div className="pb-[env(safe-area-inset-bottom)]">{footer}</div>
        </div>
      </div>,
      document.body,
    );
  }

  // The positioning and the entrance animation are split across two elements:
  // a centred popover needs its own `-translate-x-1/2`, which the animation's
  // own `transform` would otherwise stomp on for the length of the keyframes.
  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute top-full z-[1200] mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)]",
        align === "right" && "right-0",
        align === "left" && "left-0",
        align === "center" && "left-1/2 -translate-x-1/2",
      )}
    >
      <div
        role="dialog"
        aria-label={title}
        className="animate-popover-in flex max-h-[min(34rem,calc(100vh-8rem))] flex-col rounded-xl border border-line-strong bg-card shadow-card"
      >
        {header}
        {body}
        {footer}
      </div>
    </div>
  );
}
