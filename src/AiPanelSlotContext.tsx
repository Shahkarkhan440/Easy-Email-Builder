import React, { createContext, useContext } from 'react';

const AiPanelSlotContext = createContext<React.ReactNode | null>(null);

export function AiPanelSlotProvider({
  value,
  children,
}: {
  value: React.ReactNode | null;
  children: React.ReactNode;
}) {
  return <AiPanelSlotContext.Provider value={value}>{children}</AiPanelSlotContext.Provider>;
}

export function useAiPanelSlot(): React.ReactNode | null {
  return useContext(AiPanelSlotContext);
}
