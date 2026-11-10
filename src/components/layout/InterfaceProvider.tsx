"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

const KEY = "meudinheiro-interface";
const EVENT = "meudinheiro-interface-change";
const InterfaceContext = createContext({ isModern: false });

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}
function getSnapshot() {
  try { return localStorage.getItem(KEY) === "modern"; } catch { return false; }
}
function setInterface(modern: boolean) {
  try { localStorage.setItem(KEY, modern ? "modern" : "classic"); } catch { /* storage may be unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useInterface() { return useContext(InterfaceContext); }

export function InterfaceProvider({ children }: { children: React.ReactNode }) {
  const isModern = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return (
    <InterfaceContext.Provider value={{ isModern }}>
      <div data-interface={isModern ? "modern" : "classic"} className="interface-shell flex min-h-screen flex-1">
        {children}
      </div>
    </InterfaceContext.Provider>
  );
}

export function InterfaceToggle() {
  const { isModern } = useInterface();
  return (
    <div role="group" aria-label="Escolher interface" className="interface-toggle">
      <button type="button" aria-pressed={!isModern} onClick={() => setInterface(false)}>UI atual</button>
      <button type="button" aria-pressed={isModern} onClick={() => setInterface(true)}>Nova UI</button>
    </div>
  );
}
