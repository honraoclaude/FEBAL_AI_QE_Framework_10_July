import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { actingUser, setActingUser, useApi } from './api';
import type { User } from './types';
import { Dashboard } from './pages/Dashboard';
import { SprintPage } from './pages/Sprint';
import { BacklogPage } from './pages/Backlog';
import { LiveWorkflowPage } from './pages/LiveWorkflow';
import { PhasePage } from './pages/PhasePage';
import { AgentsPage } from './pages/Agents';
import { KnowledgePage } from './pages/Knowledge';
import { MetricsPage } from './pages/Metrics';
import { ReportsPage } from './pages/Reports';
import { AdminPage } from './pages/Admin';
import { SettingsPage } from './pages/Settings';

const NAV: Array<{ section: string; links: Array<{ to: string; label: string; icon: string }> }> = [
  {
    section: 'Overview',
    links: [
      { to: '/', label: 'Dashboard', icon: '◧' },
      { to: '/sprint', label: 'Current Sprint', icon: '⚡' },
      { to: '/backlog', label: 'Backlog', icon: '☰' },
    ],
  },
  {
    section: 'Delivery Pipeline',
    links: [
      { to: '/workflow', label: 'Live Workflow', icon: '⛓' },
      { to: '/refinement', label: 'Refinement', icon: '✎' },
      { to: '/development', label: 'Development', icon: '{}' },
      { to: '/testing', label: 'Testing', icon: '✓' },
      { to: '/release', label: 'Release', icon: '⛟' },
      { to: '/deploy-learn', label: 'Deploy & Learn', icon: '↻' },
    ],
  },
  {
    section: 'Intelligence',
    links: [
      { to: '/agents', label: 'AI Agents', icon: '❉' },
      { to: '/knowledge', label: 'Knowledge Centre', icon: '📚' },
      { to: '/metrics', label: 'Metrics', icon: '📈' },
      { to: '/reports', label: 'Reports', icon: '🗎' },
    ],
  },
  {
    section: 'Platform',
    links: [
      { to: '/administration', label: 'Administration', icon: '⚙' },
      { to: '/settings', label: 'Settings', icon: '☼' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/sprint': 'Current Sprint',
  '/backlog': 'Backlog',
  '/workflow': 'Live Workflow',
  '/refinement': 'Refinement',
  '/development': 'Development',
  '/testing': 'Testing',
  '/release': 'Release',
  '/deploy-learn': 'Deploy & Learn',
  '/agents': 'AI Agents',
  '/knowledge': 'Knowledge Centre',
  '/metrics': 'Metrics',
  '/reports': 'Reports',
  '/administration': 'Administration',
  '/settings': 'Settings',
};

export default function App() {
  const location = useLocation();
  const users = useApi<User[]>('/api/v1/users');

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Q</span>
          <span>
            QE.ai
            <small>AI OS for Quality Engineering</small>
          </span>
        </div>
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="nav-section">{group.section}</div>
            {group.links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <span className="icon">{link.icon}</span>
                {link.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{TITLES[location.pathname] ?? 'QE.ai'}</h1>
          <div className="row">
            <span className="meta">Meridian Wealth (Demo) · UK South</span>
            <select
              value={actingUser()}
              onChange={(event) => {
                setActingUser(event.target.value);
                window.location.reload();
              }}
              title="Acting as (demo role switcher)"
            >
              {(users.data ?? [{ id: 'admin', displayName: 'Ada Nwosu', roles: ['ADMIN'], email: '' }]).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} — {user.roles.join(', ')}
                </option>
              ))}
            </select>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sprint" element={<SprintPage />} />
            <Route path="/backlog" element={<BacklogPage />} />
            <Route path="/workflow" element={<LiveWorkflowPage />} />
            <Route path="/refinement" element={<PhasePage workflowId="refinement" blurb="Story analysis → Salesforce impact → Three Amigos → FCA & Consumer Duty → BDD → automation ROI → gate → human approval." />} />
            <Route path="/development" element={<PhasePage workflowId="development" blurb="Code generation → architecture validation → code/security/performance review → unit tests → coverage → gate → human approval." />} />
            <Route path="/testing" element={<PhasePage workflowId="testing" blurb="Environment validation → test data → regression selection → parallel suites → compliance → execution → defect analysis → RCA → gate." />} />
            <Route path="/release" element={<PhasePage workflowId="release" blurb="Release readiness → risk assessment → communications → rollback readiness → deployment approval → gate → deploy." />} />
            <Route path="/deploy-learn" element={<PhasePage workflowId="deploy-learn" blurb="CI/CD → production validation → monitoring & observability → incident detection → knowledge update → learning → metrics." />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/administration" element={<AdminPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
