import { create } from 'zustand';

export type ChatMessage = { role: 'user' | 'assistant'; content: string; id: string };
type StudioState = {
  root: string | null;
  activeFile: string | null;
  fileContent: string;
  dirty: boolean;
  model: string;
  messages: ChatMessage[];
  set: (partial: Partial<StudioState>) => void;
};
export const useStudio = create<StudioState>((set) => ({
  root: null, activeFile: null, fileContent: '', dirty: false, model: 'openai/gpt-4o-mini', messages: [],
  set: (partial) => set(partial)
}));