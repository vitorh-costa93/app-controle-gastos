"use client";

import { createContext, useContext } from "react";

const InterfaceContext = createContext({ isModern: true });

export function useInterface() {
  return useContext(InterfaceContext);
}

export function InterfaceProvider({ children }: { children: React.ReactNode }) {
  return (
    <InterfaceContext.Provider value={{ isModern: true }}>
      <div data-interface="modern" className="interface-shell flex min-h-screen flex-1">
        {children}
      </div>
    </InterfaceContext.Provider>
  );
}
