"use client";

import { useEffect, useRef } from "react";

/** Fits the actual glyphs after Inter Tight loads and whenever the chart resizes. */
export function AdaptiveAmount({ value }: { value: string }) {
  const box = useRef<HTMLElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const container = box.current, content = text.current;
    if (!container || !content) return;
    let active = true;
    function fit() {
      if (!active || !container || !content) return;
      const available = container.clientWidth;
      if (!available) return;
      // Measure at the preferred size, independent of the previous fitted size.
      content.style.fontSize = "18px";
      const measured = content.getBoundingClientRect().width;
      content.style.fontSize = `${Math.min(18, 18 * available / Math.max(1, measured))}px`;
    }
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    fit();
    void document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [value]);
  return <strong ref={box} className="adaptive-amount" title={value}><span ref={text}>{value}</span></strong>;
}
