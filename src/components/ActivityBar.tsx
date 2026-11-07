import {
  CircleHelp,
  Files,
  GitBranch,
  Github,
  Search,
  Settings,
  Sparkles
} from 'lucide-react';
import { useStudio, type SidebarView } from '../lib/store';

const ITEMS: Array<{ id: SidebarView; label: string; icon: typeof Files }> = [
  { id: 'explorer', label: 'Explorer', icon: Files },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'git', label: 'Source Control', icon: GitBranch },
  { id: 'github', label: 'GitHub', icon: Github }
];

export function ActivityBar({ onSettings, onAbout }: { onSettings: () => void; onAbout: () => void }) {
  const activeView = useStudio(state => state.activeView);
  const sidebarOpen = useStudio(state => state.sidebarOpen);
  const git = useStudio(state => state.git);
  const settings = useStudio(state => state.settings);
  const patch = useStudio(state => state.patch);

  return (
    <nav className="activity-bar" aria-label="Workspace views">
      <div className="activity-group">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = sidebarOpen && activeView === item.id;
          return (
            <button
              type="button"
              key={item.id}
              className={'activity-button ' + (active ? 'active' : '')}
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                if (active) patch({ sidebarOpen: false });
                else patch({ activeView: item.id, sidebarOpen: true });
              }}
            >
              <Icon size={19} strokeWidth={1.7} />
              {item.id === 'git' && Boolean(git?.files.length) && <span className="activity-badge">{git!.files.length}</span>}
              {item.id === 'github' && settings?.hasGithubToken && <span className="activity-dot" />}
            </button>
          );
        })}
      </div>

      <div className="activity-group bottom">
        <button
          type="button"
          className="activity-button"
          title="Open assistant"
          aria-label="Open assistant"
          onClick={() => patch({ rightOpen: true, rightTab: 'chat' })}
        >
          <Sparkles size={18} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          className="activity-button"
          title="Settings"
          aria-label="Settings"
          onClick={onSettings}
        >
          <Settings size={18} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          className="activity-button"
          title="About DARKI Code Studio"
          aria-label="About"
          onClick={onAbout}
        >
          <CircleHelp size={18} strokeWidth={1.7} />
        </button>
      </div>
    </nav>
  );
}
