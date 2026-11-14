import React, { useState } from 'react';
import { Users, Plus, KeyRound, LogOut, LogIn, Menu, X, Shield, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

interface NavbarProps {
  onOpenCreateTeam: () => void;
  onOpenJoinCode: () => void;
  onOpenAuth: () => void;
  activeView: 'board' | 'team';
  setActiveView: (view: 'board' | 'team') => void;
  isSseConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenCreateTeam,
  onOpenJoinCode,
  onOpenAuth,
  activeView,
  setActiveView,
  isSseConnected,
}) => {
  const { user, currentTeam, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Live Sync Indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView('board')}
              className="flex items-center gap-2.5 text-left focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg p-1"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  TeamUp
                </span>
                <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Race-Proof
                </span>
              </div>
            </button>

            {/* Live SSE status indicator */}
            <div
              className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                isSseConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
              }`}
              title={isSseConnected ? 'Connected to live real-time sync via SSE' : 'Reconnecting to SSE...'}
            >
              <Radio className="w-3 h-3 animate-pulse" />
              <span>{isSseConnected ? 'Live Sync' : 'Reconnecting'}</span>
            </div>
          </div>

          {/* Desktop Nav Controls */}
          <nav className="hidden md:flex items-center gap-2" aria-label="Main Navigation">
            <button
              onClick={() => setActiveView('board')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeView === 'board'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Teammates Board
            </button>

            {currentTeam && (
              <button
                onClick={() => setActiveView('team')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeView === 'team'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    : 'text-emerald-400 hover:bg-emerald-950/50 border border-emerald-800/50'
                }`}
              >
                <span>My Team: {currentTeam.team.name}</span>
                <span className="text-xs bg-emerald-900/80 px-1.5 py-0.5 rounded-full font-mono">
                  {currentTeam.members.length}/{currentTeam.team.maxTeamSize}
                </span>
              </button>
            )}

            {user ? (
              <>
                {!currentTeam && (
                  <>
                    <button
                      onClick={onOpenJoinCode}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-emerald-400" />
                      <span>Join with Code</span>
                    </button>

                    <button
                      onClick={onOpenCreateTeam}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Team</span>
                    </button>
                  </>
                )}

                <div className="h-5 w-px bg-slate-800 mx-1" />

                <div className="flex items-center gap-2.5 pl-1">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-white leading-none">{user.name}</p>
                    <p className="text-[10px] text-slate-400 leading-none mt-1 truncate max-w-[120px]">
                      {user.email}
                    </p>
                  </div>
                  <button
                    onClick={logout}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Log out"
                    aria-label="Log out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Log In / Sign Up</span>
              </button>
            )}
          </nav>

          {/* Mobile Hamburger Button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-900/98 px-4 pt-3 pb-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-400">
            <span>Real-time status:</span>
            <span className={isSseConnected ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
              {isSseConnected ? '● Live Syncing' : '○ Reconnecting'}
            </span>
          </div>

          <button
            onClick={() => {
              setActiveView('board');
              setMobileMenuOpen(false);
            }}
            className="w-full text-left py-2 px-3 rounded-lg text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Teammates Board
          </button>

          {currentTeam && (
            <button
              onClick={() => {
                setActiveView('team');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800"
            >
              <span>My Team: {currentTeam.team.name}</span>
              <span className="text-xs bg-emerald-900 px-2 py-0.5 rounded-full">
                {currentTeam.members.length}/{currentTeam.team.maxTeamSize}
              </span>
            </button>
          )}

          {user ? (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="px-3 py-1">
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <p className="text-xs text-slate-400">{user.email}</p>
              </div>

              {!currentTeam && (
                <>
                  <button
                    onClick={() => {
                      onOpenJoinCode();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium bg-slate-800 text-slate-200 border border-slate-700"
                  >
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    <span>Join with Invite Code</span>
                  </button>

                  <button
                    onClick={() => {
                      onOpenCreateTeam();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium bg-emerald-600 text-white"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Team</span>
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium text-rose-400 bg-rose-950/30 border border-rose-900/50"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                onOpenAuth();
                setMobileMenuOpen(false);
              }}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-bold bg-emerald-600 text-white text-center"
            >
              Log In / Register
            </button>
          )}
        </div>
      )}
    </header>
  );
};
