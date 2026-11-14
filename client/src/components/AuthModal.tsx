import React, { useState } from 'react';
import { LogIn, UserPlus, Check, Globe } from 'lucide-react';
import { Modal } from './Modal.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_SKILLS = [
  'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Python',
  'Docker', 'Rust', 'GraphQL', 'TailwindCSS', 'Machine Learning', 'AWS', 'Go'
];

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, register } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['TypeScript', 'React']);
  const [loading, setLoading] = useState(false);

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        addToast({
          type: 'success',
          title: 'Welcome Back!',
          message: 'Logged in successfully.',
        });
      } else {
        await register({
          email: email.trim(),
          password,
          name: name.trim(),
          timezone,
          skills: selectedSkills,
        });
        addToast({
          type: 'success',
          title: 'Account Created!',
          message: 'Welcome to TeamUp! You can now form or join a team.',
        });
      }
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: mode === 'login' ? 'Login Failed' : 'Registration Failed',
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
      title={mode === 'login' ? 'Log In to TeamUp' : 'Register for Hackathon'}
      description="Access the live board, manage your team, and match with complementary teammates."
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Tab Toggle */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Log In
          </button>
          <button
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => setMode('register')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-semibold text-slate-300 mb-1">
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Chen"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-300 mb-1">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@hackathon.dev"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="auth-pw" className="block text-xs font-semibold text-slate-300 mb-1">
              Password
            </label>
            <input
              id="auth-pw"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Detected Timezone
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
                  <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{timezone}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Your Primary Skills (Select up to 5)
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-950 rounded-xl border border-slate-800">
                  {COMMON_SKILLS.map((skill) => {
                    const isSelected = selectedSkills.includes(skill);
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        <span>{skill}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
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
              disabled={loading}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
