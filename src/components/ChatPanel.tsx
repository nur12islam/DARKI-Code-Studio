import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronDown,
  CircleStop,
  FileCode2,
  History,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Shield,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Trash2,
  WandSparkles,
  X
} from 'lucide-react';
import { useStudio, type AgentStep, type ChatItem, type ChatSession } from '../lib/store';
import type { Provider, PublicSettings } from '../lib/types';
import { buildSystemPrompt, formatTime, sortChats, titleFromPrompt, uid } from '../lib/utils';
import { Markdown } from './Markdown';

type Props = {
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onApplyCode: (code: string, language: string) => void;
};

const SUGGESTIONS = [
  'Audit this project and list the highest-impact fixes.',
  'Explain the architecture and where the main entry points are.',
  'Find and fix any TypeScript or build errors.',
  'Add a polished empty state to the main screen.'
];

const APPROVAL_MODES: Array<{
  id: PublicSettings['approvalMode'];
  label: string;
  short: string;
  description: string;
}> = [
  { id: 'ask', label: 'Ask first', short: 'Ask', description: 'Review every write, command and Git action.' },
  {
    id: 'edits',
    label: 'Auto-edit',
    short: 'Edits',
    description: 'File writes apply immediately. Commands still need approval.'
  },
  {
    id: 'readonly',
    label: 'Read-only',
    short: 'Locked',
    description: 'The agent may inspect files but never change them.'
  }
];

export function ChatPanel({ onOpenFolder, onOpenSettings, onApplyCode }: Props) {
  const root = useStudio(state => state.root);
  const settings = useStudio(state => state.settings);
  const activePath = useStudio(state => state.activePath);
  const tabs = useStudio(state => state.tabs);
  const chats = useStudio(state => state.chats);
  const activeChatId = useStudio(state => state.activeChatId);
  const busy = useStudio(state => state.busy);
  const stopping = useStudio(state => state.stopping);
  const currentStep = useStudio(state => state.currentStep);
  const stream = useStudio(state => state.stream);
  const models = useStudio(state => state.models);
  const setActiveChatId = useStudio(state => state.setActiveChatId);
  const createChat = useStudio(state => state.createChat);
  const removeChat = useStudio(state => state.removeChat);
  const setChatTitle = useStudio(state => state.setChatTitle);
  const setSettings = useStudio(state => state.setSettings);
  const patch = useStudio(state => state.patch);
  const log = useStudio(state => state.log);
  const showToast = useStudio(state => state.showToast);
  const askConfirm = useStudio(state => state.askConfirm);
  const askPrompt = useStudio(state => state.askPrompt);

  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStick = useRef(true);

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeChatId) || chats[0] || null,
    [chats, activeChatId]
  );
  const sortedChats = useMemo(() => sortChats(chats), [chats]);
  const provider: Provider = settings?.modelProvider || 'gemini';
  const model = provider === 'gemini' ? settings?.geminiModel : settings?.openrouterModel;
  const hasKey = provider === 'gemini' ? settings?.hasGeminiKey : settings?.hasOpenRouterKey;
  const mode = settings?.approvalMode || 'ask';
  const modeInfo = APPROVAL_MODES.find(item => item.id === mode) || APPROVAL_MODES[0];
  const ready = Boolean(root && hasKey && model);

  useEffect(() => {
    if (!historyOpen && !modeOpen) return;
    const close = () => {
      setHistoryOpen(false);
      setModeOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [historyOpen, modeOpen]);

  useEffect(() => {
    if (!shouldStick.current) return;
    messageEnd.current?.scrollIntoView({ block: 'end' });
  }, [activeChat?.messages, busy]);

  useEffect(() => {
    if (!activeChatId && chats[0]) setActiveChatId(chats[0].id);
  }, [activeChatId, chats, setActiveChatId]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    shouldStick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
  };

  const autosize = () => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = Math.min(190, element.scrollHeight) + 'px';
  };

  const changeMode = async (next: PublicSettings['approvalMode']) => {
    setModeOpen(false);
    if (!settings || settings.approvalMode === next) return;
    try {
      const snapshot = await window.studio.updateSettings({ approvalMode: next });
      setSettings(snapshot);
      log('Approval mode set to ' + next, 'info');
      showToast({
        kind: 'info',
        title: 'Approval mode updated',
        message: APPROVAL_MODES.find(item => item.id === next)?.description
      });
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not change approval mode', message: String(error) });
    }
  };

  const newChat = () => {
    if (busy) {
      showToast({ kind: 'warning', title: 'Stop the current answer first' });
      return;
    }
    createChat();
    setHistoryOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  };

  const renameChat = async (chat: ChatSession) => {
    const title = await askPrompt({
      title: 'Rename conversation',
      label: 'Chat title',
      defaultValue: chat.title,
      confirmLabel: 'Rename'
    });
    if (title) setChatTitle(chat.id, title);
  };

  const deleteChat = async (chat: ChatSession) => {
    if (busy && chat.id === activeChatId) {
      showToast({ kind: 'warning', title: 'Stop the current answer first' });
      return;
    }
    const ok = await askConfirm({
      title: 'Delete this conversation?',
      message: `“${chat.title}” and its messages will be removed from this project.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (ok) removeChat(chat.id);
  };

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    if (!root) {
      onOpenFolder();
      return;
    }
    if (!hasKey || !model) {
      onOpenSettings();
      return;
    }

    const state = useStudio.getState();
    let chatId = state.activeChatId;
    let chat: ChatSession | undefined = state.chats.find(item => item.id === chatId) || state.chats[0];
    if (!chat) {
      chatId = state.createChat();
      chat = useStudio.getState().chats.find(item => item.id === chatId);
    }
    if (!chat || !chatId) return;

    const now = Date.now();
    const userMessage: ChatItem = { id: uid(), role: 'user', content: prompt, createdAt: now };
    const assistantMessage: ChatItem = {
      id: uid(),
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      steps: [],
      model
    };

    state.appendMessage(chatId, userMessage);
    state.appendMessage(chatId, assistantMessage);
    if (!chat.messages.some(message => message.role === 'user')) {
      state.setChatTitle(chatId, titleFromPrompt(prompt));
    }
    setInput('');
    window.setTimeout(autosize, 0);
    shouldStick.current = true;

    const recentFiles = tabs.slice(0, 6).map(tab => tab.path);
    const history = chat.messages
      .filter(message => message.role === 'user' || (message.role === 'assistant' && message.content && !message.error))
      .slice(-24)
      .map(message => ({ role: message.role, content: message.content }));
    const system: { role: 'system'; content: string } = {
      role: 'system',
      content: buildSystemPrompt(root, activePath, settings, recentFiles)
    };
    const requestId = uid();
    const request = {
      root,
      requestId,
      provider,
      model,
      messages: [system, ...history, { role: 'user' as const, content: prompt }],
      temperature: settings?.temperature ?? 0.2,
      autoFallback: settings?.autoFallback ?? true,
      fallbackModels: String(settings?.fallbackModels || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    };

    state.patch({
      busy: true,
      stopping: false,
      stream: { requestId, chatId, messageId: assistantMessage.id },
      activeRequest: request,
      currentStep: 'Thinking',
      usage: null
    });

    try {
      const result = await window.studio.chat(request);
      state.updateMessage(chatId, assistantMessage.id, message => ({
        ...message,
        content:
          result.content ||
          message.content ||
          (result.cancelled ? 'Stopped before the model produced a response.' : 'The model returned an empty response.'),
        stopped: result.cancelled,
        error: false,
        usage: result.usage,
        model
      }));
      if (result.cancelled) log('Agent run stopped by the user', 'warning');
      else log(`Agent finished after ${result.steps} step${result.steps === 1 ? '' : 's'}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.updateMessage(chatId, assistantMessage.id, item => ({
        ...item,
        content:
          (item.content ? item.content + '\n\n' : '') +
          '**The request failed.**\n\n' +
          message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
        error: true
      }));
      log('Agent request failed: ' + message, 'error');
      showToast({ kind: 'error', title: 'Agent request failed', message });
    } finally {
      state.patch({
        busy: false,
        stopping: false,
        stream: null,
        activeRequest: null,
        currentStep: null
      });
    }
  };

  const stop = () => {
    const state = useStudio.getState();
    if (!state.stream) return;
    patch({ stopping: true, currentStep: 'Stopping…' });
    void window.studio.cancelChat(state.stream.requestId).then(cancelled => {
      if (!cancelled) useStudio.getState().patch({ stopping: false });
    });
  };

  const selectSuggestion = (text: string) => {
    setInput(text);
    window.setTimeout(() => {
      autosize();
      inputRef.current?.focus();
    }, 0);
  };

  if (!root) {
    return (
      <div className="chat-panel chat-empty-state">
        <div className="chat-empty-glow" />
        <span className="feature-icon cyan large">
          <Sparkles size={22} />
        </span>
        <h2>Your coding agent needs a project</h2>
        <p>
          Open a folder so DARKI can inspect real files, propose diffs and verify changes. Nothing is sent anywhere
          until you send a prompt.
        </p>
        <button type="button" className="btn primary" onClick={onOpenFolder}>
          <FileCode2 size={15} /> Open a project
        </button>
        <button type="button" className="btn ghost" onClick={onOpenSettings}>
          <Shield size={14} /> Configure providers
        </button>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div className="chat-title" onMouseDown={event => event.stopPropagation()}>
          <button
            type="button"
            className={'chat-title-button ' + (historyOpen ? 'open' : '')}
            onClick={() => setHistoryOpen(value => !value)}
            title="Conversation history"
          >
            <span className="chat-orb">
              <Sparkles size={13} />
            </span>
            <span className="chat-title-copy">
              <strong>{activeChat?.title || 'New chat'}</strong>
              <small>
                {provider === 'gemini' ? 'Gemini' : 'OpenRouter'} · {model || 'no model'}
              </small>
            </span>
            <ChevronDown size={13} />
          </button>
          {historyOpen && (
            <div className="chat-history-pop" onMouseDown={event => event.stopPropagation()}>
              <div className="pop-head">
                <span className="eyebrow">CONVERSATIONS</span>
                <button type="button" className="btn ghost tiny" onClick={newChat}>
                  <MessageSquarePlus size={12} /> New
                </button>
              </div>
              <div className="chat-history-list">
                {sortedChats.map(chat => (
                  <div
                    key={chat.id}
                    className={'chat-history-row ' + (chat.id === activeChat?.id ? 'active' : '')}
                  >
                    <button
                      type="button"
                      className="chat-history-main"
                      onClick={() => {
                        setActiveChatId(chat.id);
                        setHistoryOpen(false);
                      }}
                    >
                      <span>
                        <strong>{chat.title}</strong>
                        <small>
                          {chat.messages.length} message{chat.messages.length === 1 ? '' : 's'}
                        </small>
                      </span>
                      <em>{formatTime(chat.updatedAt)}</em>
                    </button>
                    <button type="button" className="icon-btn tiny" title="Rename" onClick={() => void renameChat(chat)}>
                      <Pencil size={11} />
                    </button>
                    <button type="button" className="icon-btn tiny" title="Delete" onClick={() => void deleteChat(chat)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="chat-head-actions">
          <div className="mode-wrap" onMouseDown={event => event.stopPropagation()}>
            <button
              type="button"
              className={'mode-button tone-' + mode}
              onClick={() => setModeOpen(value => !value)}
              title="Change approval mode"
            >
              {mode === 'readonly' ? <Shield size={12} /> : <ShieldCheck size={12} />}
              {modeInfo.short}
              <ChevronDown size={11} />
            </button>
            {modeOpen && (
              <div className="mode-pop">
                <span className="eyebrow">AGENT PERMISSIONS</span>
                {APPROVAL_MODES.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className={'mode-option ' + (item.id === mode ? 'active' : '')}
                    onClick={() => void changeMode(item.id)}
                  >
                    <span className={'mode-check ' + (item.id === mode ? 'on' : '')}>
                      {item.id === mode && <Check size={10} />}
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="icon-btn" title="New conversation" onClick={newChat}>
            <SquarePen size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Conversation history"
            onClick={() => setHistoryOpen(value => !value)}
          >
            <History size={14} />
          </button>
        </div>
      </div>

      {!hasKey && (
        <div className="chat-alert warn">
          <AlertTriangle size={15} />
          <div>
            <strong>{provider === 'gemini' ? 'Gemini' : 'OpenRouter'} is not connected</strong>
            <span>Add an API key to send prompts. Keys stay encrypted in the main process.</span>
          </div>
          <button type="button" className="btn secondary tiny" onClick={onOpenSettings}>
            Connect
          </button>
        </div>
      )}

      <div className="chat-scroller" ref={scroller} onScroll={onScroll}>
        {!activeChat?.messages.length && (
          <div className="chat-welcome">
            <span className="chat-welcome-kicker">
              <Sparkles size={11} /> READY WHEN YOU ARE
            </span>
            <h3>What should we build?</h3>
            <p>
              Describe an outcome. DARKI inspects the project, edits files with approval, runs checks and shows every
              tool step.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(suggestion => (
                <button type="button" key={suggestion} className="chat-suggestion" onClick={() => selectSuggestion(suggestion)}>
                  <WandSparkles size={13} />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
            <div className="chat-context-row">
              <span>
                <FileCode2 size={11} /> {activePath || 'No file selected'}
              </span>
              <span>
                <ShieldCheck size={11} /> {modeInfo.label}
              </span>
              <span>{models.length || '—'} models available</span>
            </div>
          </div>
        )}

        {activeChat?.messages.map(message =>
          message.role === 'user' ? (
            <div className="message user" key={message.id}>
              <div className="message-user-bubble">{message.content}</div>
              <span className="message-time">{formatTime(message.createdAt)}</span>
            </div>
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              streaming={Boolean(stream && stream.messageId === message.id)}
              onApplyCode={onApplyCode}
            />
          )
        )}

        {busy && stream && (
          <div className="chat-typing">
            <span className="pulse-dot" />
            <span>{currentStep || 'Thinking'}</span>
            {stream && (
              <button type="button" className="chat-typing-stop" onClick={stop} disabled={stopping}>
                {stopping ? <Loader2 size={12} className="spin" /> : <CircleStop size={12} />}
                Stop
              </button>
            )}
          </div>
        )}
        <div ref={messageEnd} />
      </div>

      <form
        className={'chat-composer ' + (!ready ? 'blocked' : '')}
        onSubmit={event => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="composer-context">
          <span className="context-chip">
            <FileCode2 size={11} />
            {activePath ? activePath.split('/').pop() : 'No file'}
          </span>
          <span className="context-chip subtle">
            <ShieldCheck size={11} />
            {modeInfo.short}
          </span>
          <span className="composer-spacer" />
          <span className="composer-model">{model || 'No model selected'}</span>
        </div>
        <div className="composer-input-row">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            placeholder={
              !hasKey
                ? 'Connect a provider to start…'
                : ready
                  ? 'Describe the change, ask a question, or paste an error…'
                  : 'Open a project to start…'
            }
            disabled={!ready || busy}
            onChange={event => {
              setInput(event.target.value);
              autosize();
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <button type="button" className="send-button stop" onClick={stop} disabled={stopping} title="Stop the agent">
              {stopping ? <Loader2 size={16} className="spin" /> : <CircleStop size={16} />}
            </button>
          ) : (
            <button type="submit" className="send-button" disabled={!input.trim() || !ready} title="Send (Enter)">
              <ArrowUp size={17} />
            </button>
          )}
        </div>
        <div className="composer-foot">
          <span>
            <kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> newline
          </span>
          {!hasKey ? (
            <button type="button" className="composer-link" onClick={onOpenSettings}>
              Connect provider
            </button>
          ) : (
            <button type="button" className="composer-link" onClick={onOpenSettings}>
              Model &amp; fallback settings
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function AssistantMessage({
  message,
  streaming,
  onApplyCode
}: {
  message: ChatItem;
  streaming: boolean;
  onApplyCode: (code: string, language: string) => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(true);
  const steps = message.steps || [];
  const running = steps.filter(step => step.status === 'running').length;
  const hasError = steps.some(step => step.status === 'error' || step.status === 'denied');

  return (
    <div className={'message assistant ' + (message.error ? 'has-error' : '')}>
      <div className="message-avatar">
        <Sparkles size={14} />
      </div>
      <div className="message-body">
        <div className="message-meta">
          <strong>DARKI</strong>
          {message.model && <span className="message-model">{message.model}</span>}
          {message.stopped && <em className="message-stopped">stopped</em>}
          {message.usage?.totalTokens ? (
            <span className="message-tokens">{message.usage.totalTokens.toLocaleString()} tokens</span>
          ) : null}
        </div>

        {steps.length > 0 && (
          <div className={'agent-timeline ' + (hasError ? 'with-error' : '')}>
            <button type="button" className="timeline-head" onClick={() => setStepsOpen(value => !value)}>
              <span className={'timeline-pulse ' + (running ? 'running' : '')} />
              <span>
                {running
                  ? `${running} tool${running === 1 ? '' : 's'} running`
                  : `${steps.length} agent step${steps.length === 1 ? '' : 's'}`}
              </span>
              {message.stepInfo && (
                <em>
                  step {message.stepInfo.step}/{message.stepInfo.maxSteps}
                </em>
              )}
              <ChevronDown size={12} className={stepsOpen ? 'rotated' : ''} />
            </button>
            {stepsOpen && (
              <div className="timeline-list">
                {steps.map(step => (
                  <StepRow key={step.id} step={step} />
                ))}
              </div>
            )}
          </div>
        )}

        {message.content ? (
          <Markdown content={message.content} onApply={onApplyCode} />
        ) : streaming ? (
          <div className="message-streaming">
            <span className="stream-caret" />
            Waiting for the first token…
          </div>
        ) : (
          <div className="message-empty">No response text.</div>
        )}

        {message.usage?.cost !== undefined && (
          <div className="message-usage">
            <span>
              {message.usage.promptTokens?.toLocaleString() || 0} in ·{' '}
              {message.usage.completionTokens?.toLocaleString() || 0} out
            </span>
            <span>${message.usage.cost.toFixed(4)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  return (
    <div className={'timeline-row status-' + step.status}>
      <span className="timeline-icon">
        {step.status === 'running' ? (
          <Loader2 size={12} className="spin" />
        ) : step.status === 'ok' ? (
          <Check size={12} />
        ) : step.status === 'denied' ? (
          <Shield size={12} />
        ) : (
          <X size={12} />
        )}
      </span>
      <div className="timeline-copy">
        <strong>{step.label}</strong>
        {step.detail && <code>{step.detail}</code>}
        {step.summary && step.status !== 'running' && (
          <small className="timeline-summary">{step.summary}</small>
        )}
      </div>
      {step.durationMs !== undefined && (
        <em className="timeline-duration">
          {step.durationMs < 1000 ? step.durationMs + 'ms' : (step.durationMs / 1000).toFixed(1) + 's'}
        </em>
      )}
    </div>
  );
}
