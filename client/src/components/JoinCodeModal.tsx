import React, { useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { Modal } from './Modal.js';
import { apiRequest } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import type { TeamDto } from '../types/index.js';

interface JoinCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (team: TeamDto) => void;
}

export const JoinCodeModal: React.FC<JoinCodeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { refreshTeam, currentTeam, setCurrentTeam } = useAuth();
  const { addToast } = useToast();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOptimistic, setIsOptimistic] = useState(false);

  const formatCode = (val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
    if (clean.length > 5) {
      return `${clean.slice(0, 5)}-${clean.slice(5)}`;
    }
    return clean;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(formatCode(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.replace('-', '').trim();
    if (cleanCode.length !== 10) return;

    setLoading(true);
    setIsOptimistic(true);

    // 1. Optimistic snapshot
    const previousTeam = currentTeam;

    try {
      const res = await apiRequest<{ team: TeamDto }>('/teams/join-by-code', {
        method: 'POST',
        body: JSON.stringify({ code: cleanCode }),
      });

      addToast({
        type: 'success',
        title: 'Joined Team!',
        message: `Welcome to "${res.team.name}". Your seat is locked in!`,
      });

      await refreshTeam();
      onSuccess(res.team);
      onClose();
    } catch (err: any) {
      // 2. Concurrency Conflict Rollback
      setCurrentTeam(previousTeam);
      setIsOptimistic(false);

      if (err.code === 'TEAM_FULL') {
        addToast({
          type: 'conflict',
          title: 'Seat Conflict: Team Full!',
          message: 'Someone locked in the last seat a millisecond before you. Rolled back cleanly.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Could Not Join',
          message: err.message || 'Invalid or expired invite code.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Join with Invite Code"
      description="Enter the 10-character code provided by your team leader (e.g. 7KW9X-2M4PL)."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="invite-code" className="block text-xs font-semibold text-slate-300 mb-1">
            Invite Code
          </label>
          <div className="relative">
            <KeyRound className="w-5 h-5 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="invite-code"
              type="text"
              required
              value={code}
              onChange={handleInputChange}
              placeholder="AAAAA-AAAAA"
              maxLength={11}
              className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-lg font-bold text-white tracking-widest placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              autoFocus
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Protected against brute-force attacks via rate limits and high cryptographic entropy.
          </p>
        </div>

        {isOptimistic && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Optimistically verifying seat availability with database lock...</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || code.replace('-', '').length !== 10}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            {loading ? 'Securing Seat...' : 'Join Team'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
