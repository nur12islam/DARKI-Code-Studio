import type { ChatSession } from './store';
import { newChat } from './store';

const VERSION = 1;
const prefix = 'darki.chats.';

function keyFor(root: string) {
  return prefix + encodeURIComponent(root);
}

export function loadChats(root: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(keyFor(root));
    if (!raw) return [newChat()];
    const parsed = JSON.parse(raw) as { version?: number; chats?: ChatSession[] };
    if (!parsed || !Array.isArray(parsed.chats) || !parsed.chats.length) return [newChat()];
    const chats = parsed.chats
      .filter(chat => chat && typeof chat.id === 'string' && Array.isArray(chat.messages))
      .map(chat => ({
        ...chat,
        title: chat.title || 'New chat',
        createdAt: chat.createdAt || Date.now(),
        updatedAt: chat.updatedAt || Date.now(),
        messages: chat.messages.filter(message => message && typeof message.content === 'string')
      }));
    return chats.length ? chats : [newChat()];
  } catch {
    return [newChat()];
  }
}

export function saveChats(root: string, chats: ChatSession[]) {
  try {
    // Trim runaway histories so localStorage does not fill up.
    const trimmed = chats.map(chat => ({
      ...chat,
      messages: chat.messages.slice(-80)
    }));
    localStorage.setItem(keyFor(root), JSON.stringify({ version: VERSION, chats: trimmed }));
  } catch {
    // Storage can be unavailable (private mode, quota). Chat still works in-memory.
  }
}

export function forgetChats(root: string) {
  try {
    localStorage.removeItem(keyFor(root));
  } catch {
    // Ignore.
  }
}
