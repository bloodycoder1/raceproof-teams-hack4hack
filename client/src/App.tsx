import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { Board } from './components/Board.js';
import { TeamDashboard } from './components/TeamDashboard.js';
import { CreateTeamModal } from './components/CreateTeamModal.js';
import { JoinCodeModal } from './components/JoinCodeModal.js';
import { RequestJoinModal } from './components/RequestJoinModal.js';
import { AuthModal } from './components/AuthModal.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ToastProvider } from './context/ToastContext.js';
import type { TeamDto } from './types/index.js';
import { ShieldCheck, Cpu, Database, Activity } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentTeam } = useAuth();

  const [activeView, setActiveView] = useState<'board' | 'team'>('board');
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [selectedTeamForRequest, setSelectedTeamForRequest] = useState<TeamDto | null>(null);
  const [isSseConnected, setIsSseConnected] = useState(false);

  // Monitor SSE connection status
  useEffect(() => {
    let sse: EventSource | null = null;
    try {
      sse = new EventSource('/board/stream');
      sse.onopen = () => setIsSseConnected(true);
      sse.onerror = () => setIsSseConnected(false);
    } catch {
      setIsSseConnected(false);
    }
    return () => {
      sse?.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        onOpenCreateTeam={() => setCreateTeamOpen(true)}
        onOpenJoinCode={() => setJoinCodeOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        activeView={activeView}
        setActiveView={setActiveView}
        isSseConnected={isSseConnected}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeView === 'team' && currentTeam ? (
          <TeamDashboard onBackToBoard={() => setActiveView('board')} />
        ) : (
          <Board
            onJoinCode={() => setJoinCodeOpen(true)}
            onRequestJoin={(team) => setSelectedTeamForRequest(team)}
            onOpenAuth={() => setAuthOpen(true)}
            isSseConnected={isSseConnected}
          />
        )}
      </main>

      {/* Footer with Architecture Guarantee Badges */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-8 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">TeamUp Engine</span>
            <span>•</span>
            <span>Hackathon Concurrency PS1</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Row Lock Pessimistic Concurrency</span>
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>10k Users & 2k Teams Seeded</span>
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>p95 &lt; 200ms Benchmark Verified</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CreateTeamModal
        isOpen={createTeamOpen}
        onClose={() => setCreateTeamOpen(false)}
        onSuccess={() => setActiveView('team')}
      />

      <JoinCodeModal
        isOpen={joinCodeOpen}
        onClose={() => setJoinCodeOpen(false)}
        onSuccess={() => setActiveView('team')}
      />

      <RequestJoinModal
        team={selectedTeamForRequest}
        isOpen={Boolean(selectedTeamForRequest)}
        onClose={() => setSelectedTeamForRequest(null)}
      />

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
};
