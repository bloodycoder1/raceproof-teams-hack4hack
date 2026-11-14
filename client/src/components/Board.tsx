import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Users, Sparkles, UserPlus, KeyRound, ChevronLeft, ChevronRight, CheckCircle2, Clock, Globe } from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import type { BoardData, TeamDto } from '../types/index.js';
import { useAuth } from '../context/AuthContext.js';

interface BoardProps {
  onJoinCode: () => void;
  onRequestJoin: (team: TeamDto) => void;
  onOpenAuth: () => void;
  isSseConnected: boolean;
}

const FILTER_SKILLS = [
  'All',
  'TypeScript',
  'React',
  'Node.js',
  'PostgreSQL',
  'Python',
  'Rust',
  'Docker',
  'Machine Learning',
  'TailwindCSS',
];

export const Board: React.FC<BoardProps> = ({
  onJoinCode,
  onRequestJoin,
  onOpenAuth,
  isSseConnected,
}) => {
  const { user, currentTeam } = useAuth();
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('All');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'teams' | 'participants'>('teams');

  const fetchBoard = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        hackathonId: '1',
        page: String(page),
        limit: '18',
      });
      if (search.trim()) query.set('search', search.trim());
      if (selectedSkill !== 'All') query.set('skill', selectedSkill);

      const res = await apiRequest<BoardData>(`/board?${query.toString()}`);
      setBoardData(res);
    } catch (err) {
      console.error('Failed to load board:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedSkill]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Connect to live SSE stream for zero-refresh board updates
  useEffect(() => {
    const sse = new EventSource('/board/stream');
    sse.addEventListener('board_changed', () => {
      fetchBoard();
    });
    return () => {
      sse.close();
    };
  }, [fetchBoard]);

  const totalPages = boardData ? Math.ceil(boardData.totalTeams / 18) : 1;

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-slate-800 p-6 sm:p-8">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Race-Proof Concurrency • WiredTiger / PostgreSQL Lock Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Find Teammates & Lock in Your Seat
          </h1>
          <p className="mt-2 text-slate-300 text-sm sm:text-base leading-relaxed">
            Real-time live team board for 10,000 hackathon participants. Even if hundreds of people
            click "Join" at the exact same millisecond, row-level locks guarantee exactly one person takes the last seat.
          </p>

          {!currentTeam && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={user ? onJoinCode : onOpenAuth}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <KeyRound className="w-4 h-4" />
                <span>Have an Invite Code? Join Instantly</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'teams'}
              onClick={() => setTab('teams')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'teams'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Open Teams</span>
              {boardData && (
                <span className="text-xs bg-black/30 px-2 py-0.5 rounded-full font-mono">
                  {boardData.totalTeams}
                </span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'participants'}
              onClick={() => setTab('participants')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'participants'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Looking for Teams</span>
              {boardData && (
                <span className="text-xs bg-black/30 px-2 py-0.5 rounded-full font-mono">
                  {boardData.usersLooking.length}
                </span>
              )}
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search teams by name..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              aria-label="Search teams"
            />
          </div>
        </div>

        {/* Skill Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
          {FILTER_SKILLS.map((skill) => (
            <button
              key={skill}
              onClick={() => {
                setSelectedSkill(skill);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full whitespace-nowrap transition-all ${
                selectedSkill === skill
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {skill}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {loading && !boardData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse p-5" />
          ))}
        </div>
      ) : tab === 'teams' ? (
        <>
          {boardData && boardData.teams.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {boardData.teams.map((team) => {
                const openSeats = team.maxTeamSize - team.memberCount;
                const isFull = openSeats <= 0;
                const isMyTeam = currentTeam?.team.id === team.id;

                return (
                  <article
                    key={team.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all rounded-2xl p-5 flex flex-col justify-between shadow-lg relative group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-lg text-white group-hover:text-emerald-400 transition-colors">
                          {team.name}
                        </h3>
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
                            openSeats === 1
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 animate-pulse'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {openSeats === 1 ? '🔥 1 SEAT LEFT' : `${openSeats} open seats`}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 mt-1">
                        Leader: <span className="text-slate-200 font-medium">{team.leaderName || 'Leader'}</span>
                      </p>

                      {/* Capacity Bar */}
                      <div className="mt-3">
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>Team Size: {team.memberCount} of {team.maxTeamSize}</span>
                          <span>{team.isComplete ? 'Qualified (>= 2)' : 'Need min 2'}</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-500 ${
                              team.memberCount >= team.maxTeamSize
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${(team.memberCount / team.maxTeamSize) * 100}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Team Skills */}
                      {team.skills && team.skills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {team.skills.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              className="text-[10px] font-medium bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                            >
                              {s}
                            </span>
                          ))}
                          {team.skills.length > 4 && (
                            <span className="text-[10px] text-slate-500 px-1 py-0.5">
                              +{team.skills.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Created {new Date(team.createdAt).toLocaleDateString()}</span>
                      </span>

                      {isMyTeam ? (
                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-950 px-3 py-1.5 rounded-lg border border-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Your Team</span>
                        </span>
                      ) : isFull ? (
                        <span className="text-xs font-medium text-slate-500 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                          Team Full
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            if (!user) onOpenAuth();
                            else onRequestJoin(team);
                          }}
                          disabled={Boolean(currentTeam)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                            currentTeam
                              ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-400'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                          }`}
                          title={currentTeam ? 'You are already in a team' : 'Request to join this team'}
                        >
                          Request to Join
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white">No teams match your criteria</h3>
              <p className="text-sm text-slate-400 mt-1">Try clearing filters or search terms.</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Page {page} of {totalPages} ({boardData?.totalTeams} total open teams)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Participants Looking For Teammates Tab */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boardData && boardData.usersLooking.length > 0 ? (
            boardData.usersLooking.map((p) => (
              <div
                key={p.userId}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center border border-emerald-500/30">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base leading-tight">{p.name}</h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <Globe className="w-3 h-3 text-emerald-400" />
                        <span>{p.timezone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.skills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-medium bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-right">
                  <span className="text-xs text-emerald-400 font-medium inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Free Agent</span>
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl">
              <p className="text-slate-400 text-sm">No free-agent participants currently listed.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
