import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  UserX,
  LogOut,
  RefreshCw,
  Sparkles,
  History,
  UserPlus,
  Users,
  Copy,
  Check,
  Clock,
  Globe,
  Radio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api.js';
import type { TeamDetails, JoinRequest, AuditLogEntry, SuggestionResult } from '../types/index.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';

interface TeamDashboardProps {
  onBackToBoard: () => void;
}

export const TeamDashboard: React.FC<TeamDashboardProps> = ({ onBackToBoard }) => {
  const { user, currentTeam, refreshTeam, setCurrentTeam } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'members' | 'requests' | 'suggestions' | 'audit'>('members');
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionResult[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [rotatedCode, setRotatedCode] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const team = currentTeam?.team;
  const isLeader = team && user ? team.leaderId === user.id : false;

  // Real-time SSE stream for this team's updates
  useEffect(() => {
    if (!team) return;
    const sse = new EventSource(`/teams/${team.id}/stream`);
    sse.addEventListener('team_changed', () => {
      refreshTeam();
      if (activeTab === 'requests') loadRequests();
      if (activeTab === 'audit') loadAudit();
    });
    return () => {
      sse.close();
    };
  }, [team?.id, activeTab, refreshTeam]);

  // Load join requests if leader
  const loadRequests = useCallback(async () => {
    if (!team) return;
    try {
      const res = await apiRequest<{ requests: JoinRequest[] }>(`/teams/${team.id}/requests`);
      setRequests(res.requests);
    } catch (err) {
      console.error('Failed to load join requests:', err);
    }
  }, [team]);

  // Load suggestions
  const loadSuggestions = useCallback(async () => {
    if (!team) return;
    setLoadingSuggestions(true);
    try {
      const res = await apiRequest<{ suggestions: SuggestionResult[] }>(`/teams/${team.id}/suggestions?limit=10`);
      setSuggestions(res.suggestions);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [team]);

  // Load audit log
  const loadAudit = useCallback(async () => {
    if (!team) return;
    setLoadingAudit(true);
    try {
      const res = await apiRequest<{ auditLogs: AuditLogEntry[] }>(`/teams/${team.id}/audit`);
      setAuditLogs(res.auditLogs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  }, [team]);

  useEffect(() => {
    if (activeTab === 'requests') loadRequests();
    if (activeTab === 'suggestions') loadSuggestions();
    if (activeTab === 'audit') loadAudit();
  }, [activeTab, loadRequests, loadSuggestions, loadAudit]);

  if (!team || !currentTeam) {
    return (
      <div className="text-center py-20 bg-slate-900 border border-slate-800 rounded-3xl p-8">
        <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white">You are not currently in a team</h2>
        <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
          Explore the live Looking-for-Teammates board to request joining an open team, or create your own!
        </p>
        <button
          onClick={onBackToBoard}
          className="mt-6 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white shadow-lg shadow-emerald-600/20"
        >
          Browse Open Teams
        </button>
      </div>
    );
  }

  // Action: Rotate Invite Code (Leader only)
  const handleRotateInviteCode = async () => {
    setIsRotating(true);
    try {
      const res = await apiRequest<{ inviteCode: string }>(`/teams/${team.id}/invite-code`, {
        method: 'POST',
      });
      setRotatedCode(res.inviteCode);
      addToast({
        type: 'success',
        title: 'New Invite Code Generated',
        message: 'Previous code has been invalidated immediately.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to Rotate Code',
        message: err.message,
      });
    } finally {
      setIsRotating(false);
    }
  };

  // Action: Accept Join Request (with OPTIMISTIC UI & ROLLBACK)
  const handleAcceptRequest = async (request: JoinRequest) => {
    // 1. Optimistic snapshot
    const previousTeam = currentTeam;
    const previousRequests = requests;

    // 2. Optimistic state transition
    const optimisticMember = {
      userId: request.userId,
      name: request.userName || 'New Member',
      skills: request.skills || [],
      timezone: request.timezone || 'UTC',
      isLeader: false,
      joinedAt: new Date().toISOString(),
    };

    setCurrentTeam((prev) =>
      prev
        ? {
            ...prev,
            team: { ...prev.team, memberCount: prev.team.memberCount + 1 },
            members: [...prev.members, optimisticMember],
          }
        : null,
    );
    setRequests((prev) => prev.filter((r) => r.id !== request.id));

    try {
      await apiRequest(`/teams/${team.id}/requests/${request.id}/accept`, {
        method: 'POST',
      });
      addToast({
        type: 'success',
        title: 'Member Added',
        message: `${request.userName || 'User'} has joined your team!`,
      });
      await refreshTeam();
    } catch (err: any) {
      // 3. Rollback on conflict (e.g. team became full concurrently)
      setCurrentTeam(previousTeam);
      setRequests(previousRequests);

      addToast({
        type: 'conflict',
        title: 'Optimistic Rollback: Concurrency Conflict',
        message: err.message || 'Team was filled by another concurrent request. Rolled back.',
      });
    }
  };

  // Action: Decline Join Request
  const handleDeclineRequest = async (requestId: number) => {
    try {
      await apiRequest(`/teams/${team.id}/requests/${requestId}/decline`, {
        method: 'POST',
      });
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      addToast({
        type: 'info',
        title: 'Request Declined',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Declining Request',
        message: err.message,
      });
    }
  };

  // Action: Remove Member (Leader only)
  const handleRemoveMember = async (memberUserId: number, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the team?`)) return;

    try {
      await apiRequest(`/teams/${team.id}/members/${memberUserId}`, {
        method: 'DELETE',
      });
      addToast({
        type: 'success',
        title: 'Member Removed',
        message: `${memberName} has been removed from the team.`,
      });
      await refreshTeam();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to Remove Member',
        message: err.message,
      });
    }
  };

  // Action: Leave Team
  const handleLeaveTeam = async () => {
    setIsLeaving(true);
    try {
      const res = await apiRequest<{ message: string; teamDeleted: boolean }>(`/teams/${team.id}/leave`, {
        method: 'POST',
      });

      setShowLeaveModal(false);
      await refreshTeam();

      addToast({
        type: 'success',
        title: res.teamDeleted ? 'Team Deleted' : 'Left Team',
        message: res.message,
      });
      onBackToBoard();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to Leave Team',
        message: err.message,
      });
    } finally {
      setIsLeaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Team Dashboard
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Live Synchronized</span>
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white mt-1.5 tracking-tight flex items-center gap-2">
              {team.name}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Roster: {currentTeam.members.length} of {team.maxTeamSize} members
              {team.isComplete ? ' (Qualified)' : ' (Needs minimum 2 to submit)'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isLeader && (
              <button
                onClick={handleRotateInviteCode}
                disabled={isRotating}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                title="Generates a new code and invalidates the previous one"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                <span>Rotate Invite Code</span>
              </button>
            )}

            <button
              onClick={() => setShowLeaveModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Team</span>
            </button>
          </div>
        </div>

        {/* Rotated Code Alert Banner */}
        {rotatedCode && (
          <div className="mt-5 p-4 rounded-2xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
            <div>
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                New Invite Code (Shown Once):
              </p>
              <p className="text-xl font-mono font-bold tracking-widest text-white mt-0.5">{rotatedCode}</p>
            </div>
            <button
              onClick={() => copyToClipboard(rotatedCode)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shrink-0"
            >
              {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mt-6 flex border-b border-slate-800 overflow-x-auto gap-2" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'members'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Members ({currentTeam.members.length})</span>
          </button>

          {isLeader && (
            <button
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                activeTab === 'requests'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Pending Requests</span>
              {requests.length > 0 && (
                <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full font-mono animate-pulse">
                  {requests.length}
                </span>
              )}
            </button>
          )}

          <button
            role="tab"
            aria-selected={activeTab === 'suggestions'}
            onClick={() => setActiveTab('suggestions')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'suggestions'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Teammate Suggestions</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'audit'}
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Log</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'members' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentTeam.members.map((member) => (
            <div
              key={member.userId}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between"
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${
                    member.isLeader
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {member.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-base leading-tight">{member.name}</h4>
                    {member.isLeader && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        <Crown className="w-3 h-3" />
                        <span>Leader</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                    <Globe className="w-3 h-3 text-emerald-400" />
                    <span>{member.timezone}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {member.skills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-medium bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Leader can kick other members */}
              {isLeader && !member.isLeader && (
                <button
                  onClick={() => handleRemoveMember(member.userId, member.name)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                  title={`Remove ${member.name} from team`}
                  aria-label={`Remove ${member.name}`}
                >
                  <UserX className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'requests' && isLeader && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Pending Membership Requests</h3>
            <span className="text-xs text-slate-400">
              Accepting is race-proof: only open slots will be filled.
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-14 bg-slate-900 border border-slate-800 rounded-2xl">
              <UserPlus className="w-9 h-9 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No pending join requests right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <h4 className="font-bold text-white text-base">{req.userName}</h4>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Requested {new Date(req.createdAt).toLocaleString()}</span>
                      <span>• Timezone: {req.timezone}</span>
                    </p>
                    {req.skills && req.skills.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {req.skills.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] font-medium bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleDeclineRequest(req.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>Decline</span>
                    </button>
                    <button
                      onClick={() => handleAcceptRequest(req)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'suggestions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Teammate Recommendation Engine</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ranks free agents by skill complementarity (0-60 pts) and timezone proximity (0-40 pts).
              </p>
            </div>
            <button
              onClick={loadSuggestions}
              disabled={loadingSuggestions}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              title="Refresh suggestions"
            >
              <RefreshCw className={`w-4 h-4 ${loadingSuggestions ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingSuggestions ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-14 bg-slate-900 border border-slate-800 rounded-2xl">
              <p className="text-slate-400 text-sm">No suggestions available at this moment.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.map((cand) => (
                <div
                  key={cand.userId}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center border border-emerald-500/30">
                        {cand.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base">{cand.name}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Globe className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{cand.timezone}</span>
                          <span>• {cand.explanation.timezoneDiffHours}h offset</span>
                        </div>
                      </div>
                    </div>

                    {/* Match Score Badge */}
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-xs text-slate-400">Match Score</span>
                        <p className="text-xl font-extrabold text-emerald-400 leading-none">
                          {cand.score}
                          <span className="text-xs font-normal text-slate-500">/100</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Explanation summary */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300">
                    <p className="font-medium text-emerald-300 mb-1">
                      💡 Why this match: {cand.explanation.summary}
                    </p>
                    <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-slate-400">
                      <span>
                        Skill Score: <strong className="text-slate-200">{cand.explanation.skillScore}/60</strong>
                      </span>
                      <span>
                        Timezone Score: <strong className="text-slate-200">{cand.explanation.timezoneScore}/40</strong>
                      </span>
                    </div>
                  </div>

                  {/* Complementary Skills Highlight */}
                  {cand.explanation.complementarySkills.length > 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                        Complementary Skills You Lack:
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {cand.explanation.complementarySkills.map((s) => (
                          <span
                            key={s}
                            className="text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-0.5 rounded-lg"
                          >
                            + {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4" />
              <span>Immutable Team Audit Trail</span>
            </h3>
            <button
              onClick={loadAudit}
              disabled={loadingAudit}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              title="Refresh audit log"
            >
              <RefreshCw className={`w-4 h-4 ${loadingAudit ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingAudit ? (
            <div className="h-40 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-14 bg-slate-900 border border-slate-800 rounded-2xl">
              <p className="text-slate-400 text-sm">No audit logs recorded for this team.</p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                        {log.action}
                      </span>
                      <span className="text-xs text-slate-400">
                        Actor: <strong className="text-slate-200">{log.actorName}</strong>
                      </span>
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <p className="text-xs font-mono text-slate-400 mt-1.5 bg-slate-950 p-2 rounded border border-slate-800/80">
                        {JSON.stringify(log.details)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(log.at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leave Team Confirmation Modal */}
      {showLeaveModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Leave Team: {team.name}</h3>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              {currentTeam.members.length === 1 ? (
                <strong className="text-rose-400">
                  You are the last remaining member. Leaving will permanently delete this team and its records.
                </strong>
              ) : isLeader ? (
                <>
                  You are the team leader. When you leave, leadership will{' '}
                  <strong className="text-emerald-400">
                    automatically transfer to the next oldest member
                  </strong>
                  .
                </>
              ) : (
                'Are you sure you want to leave this team? You will be free to join or create another team.'
              )}
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveTeam}
                disabled={isLeaving}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white"
              >
                {isLeaving ? 'Leaving...' : 'Confirm Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
