"use client";
import { useEffect, useState } from "react";
import TransitLoader from "./TransitLoader";

type Phase = "visible" | "leaving" | "gone";

/**
 * Full-screen branded splash shown on first load. Renders during SSR so there's
 * no first-paint flash, then fades out once the page has loaded (with a short
 * minimum so it doesn't blink) or after a hard timeout.
 */
export default function BootSplash() {
  const [phase, setPhase] = useState<Phase>("visible");

  useEffect(() => {
    let done = false;
    const start =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const MIN_VISIBLE_MS = 900;

    const finish = () => {
      if (done) return;
      done = true;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const wait = Math.max(0, MIN_VISIBLE_MS - (now - start));
      window.setTimeout(() => setPhase("leaving"), wait);
    };

    if (document.readyState === "complete") {
      finish();
      return;
    }
    window.addEventListener("load", finish, { once: true });
    const cap = window.setTimeout(finish, 8000);
    return () => {
      window.removeEventListener("load", finish);
      window.clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    if (phase === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      id="boot-splash"
      aria-hidden="true"
      onTransitionEnd={() => setPhase((p) => (p === "leaving" ? "gone" : p))}
      className="fixed inset-0 z-[100] transition-[opacity,transform] duration-500 ease-out"
      style={{
        opacity: phase === "leaving" ? 0 : 1,
        transform: phase === "leaving" ? "scale(1.02)" : "scale(1)",
        pointerEvents: phase === "leaving" ? "none" : "auto",
      }}
    >
      <TransitLoader fullscreen />
    </div>
  );
}
