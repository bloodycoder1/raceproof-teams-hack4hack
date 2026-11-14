import React, { useState } from 'react';
import { Send, Users } from 'lucide-react';
import { Modal } from './Modal.js';
import { apiRequest } from '../lib/api.js';
import { useToast } from '../context/ToastContext.js';
import type { TeamDto } from '../types/index.js';

interface RequestJoinModalProps {
  team: TeamDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RequestJoinModal: React.FC<RequestJoinModalProps> = ({ team, isOpen, onClose }) => {
  const { addToast } = useToast();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (!team) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiRequest(`/teams/${team.id}/requests`, {
        method: 'POST',
        body: JSON.stringify({ message: message.trim() || undefined }),
      });

      addToast({
        type: 'success',
        title: 'Request Submitted!',
        message: `Your join request has been sent to the leader of "${team.name}".`,
      });
      setMessage('');
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Request Failed',
        message: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Request to Join: ${team.name}`}
      description="The team leader will review your profile, skills, and timezone before accepting."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Current Roster:</span>
            <span className="text-white font-medium">
              {team.memberCount} of {team.maxTeamSize} seats filled
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Team Leader:</span>
            <span className="text-emerald-400 font-medium">{team.leaderName || 'Leader'}</span>
          </div>
        </div>

        <div>
          <label htmlFor="request-message" className="block text-xs font-semibold text-slate-300 mb-1">
            Intro Note (Optional)
          </label>
          <textarea
            id="request-message"
            rows={3}
            maxLength={300}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Introduce yourself or share what you'd like to build..."
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
          />
        </div>

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
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{loading ? 'Submitting...' : 'Send Request'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
