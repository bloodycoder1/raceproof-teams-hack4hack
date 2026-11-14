import React, { useState } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import { Modal } from './Modal.js';
import { apiRequest } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import type { TeamDto } from '../types/index.js';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (team: TeamDto) => void;
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { refreshTeam } = useAuth();
  const { addToast } = useToast();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ team: TeamDto; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.length < 3) return;

    setLoading(true);
    try {
      const res = await apiRequest<{ team: TeamDto; inviteCode: string }>('/teams', {
        method: 'POST',
        body: JSON.stringify({
          hackathonId: 1,
          name: name.trim(),
        }),
      });

      setCreatedResult(res);
      await refreshTeam();
      addToast({
        type: 'success',
        title: 'Team Created!',
        message: `"${res.team.name}" has been created. Invite code is shown once.`,
      });
      onSuccess(res.team);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Could Not Create Team',
        message: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!createdResult) return;
    navigator.clipboard.writeText(createdResult.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setName('');
    setCreatedResult(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={createdResult ? 'Team Created Successfully' : 'Create a New Team'}
      description={
        createdResult
          ? 'Share this invite code with teammates. For security, it is only displayed once.'
          : 'Form a new team for the hackathon. You will be assigned as the team leader.'
      }
    >
      {createdResult ? (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-emerald-950/70 border border-emerald-800 text-center">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Secret Invite Code (Expires in 48h)
            </span>
            <p className="text-2xl sm:text-3xl font-mono font-extrabold text-white tracking-widest mt-2">
              {createdResult.inviteCode}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Code Copied!' : 'Copy Code'}</span>
            </button>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl font-medium text-sm bg-slate-800 text-slate-300 hover:text-white"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="team-name" className="block text-xs font-semibold text-slate-300 mb-1">
              Team Name
            </label>
            <input
              id="team-name"
              type="text"
              required
              minLength={3}
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apex Neural Squad"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || name.trim().length < 3}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{loading ? 'Creating...' : 'Create Team'}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
