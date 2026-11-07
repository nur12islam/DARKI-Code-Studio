import type { StudioBridge } from './lib/types';

declare global {
  interface Window {
    studio: StudioBridge;
  }
}

export {};
