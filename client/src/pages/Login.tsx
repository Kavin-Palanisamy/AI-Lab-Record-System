import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Shield, GraduationCap, School, KeyRound, AlertCircle, Sparkles } from 'lucide-react';

export const Login: React.FC = () => {
  const [role, setRole] = useState<'STUDENT' | 'FACULTY'>('STUDENT');
  const [registerNumber, setRegisterNumber] = useState('048');
  const [email, setEmail] = useState('faculty@college.edu');
  const [password, setPassword] = useState('Password123!');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (role === 'STUDENT') {
        const data = await api.studentLogin(registerNumber.trim(), password);
        login(data.token, data.user);
        navigate('/student/dashboard');
      } else {
        const data = await api.facultyLogin(email.trim(), password);
        login(data.token, data.user);
        navigate('/faculty/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (demoRole: 'STUDENT' | 'FACULTY', id: string) => {
    setRole(demoRole);
    setPassword('Password123!');
    if (demoRole === 'STUDENT') {
      setRegisterNumber(id);
    } else {
      setEmail(id);
    }
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background ambient decorative glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 shadow-xl shadow-indigo-500/20 mb-3 ring-1 ring-white/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            SecureLab System
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            AI-Powered Secure Laboratory Record & Mark Management System
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass-panel rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-800">
          {/* Role selector tabs */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-900 rounded-xl mb-6 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setRole('STUDENT');
                setErrorMessage(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                role === 'STUDENT'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Student Portal
            </button>
            <button
              type="button"
              onClick={() => {
                setRole('FACULTY');
                setErrorMessage(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                role === 'FACULTY'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <School className="w-4 h-4" />
              Faculty Portal
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {role === 'STUDENT' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Register Number
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={registerNumber}
                    onChange={(e) => setRegisterNumber(e.target.value)}
                    placeholder="e.g. 048, 052"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono transition"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">REG</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Faculty Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="faculty@college.edu"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono transition"
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-lg shadow-indigo-600/25 transition disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to {role === 'STUDENT' ? 'Student' : 'Faculty'} Portal</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Quick Demo Credentials</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('STUDENT', '048')}
                className="px-2.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-left text-xs transition"
              >
                <div className="font-semibold text-white">Kavin</div>
                <div className="text-[11px] text-slate-400 font-mono">Reg: 048</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('STUDENT', '052')}
                className="px-2.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-left text-xs transition"
              >
                <div className="font-semibold text-white">Arun</div>
                <div className="text-[11px] text-slate-400 font-mono">Reg: 052</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('FACULTY', 'faculty@college.edu')}
                className="px-2.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-left text-xs transition"
              >
                <div className="font-semibold text-white">Faculty</div>
                <div className="text-[11px] text-slate-400 font-mono">Dr. Ramanathan</div>
              </button>
            </div>
          </div>
        </div>

        {/* Security Rule Pill */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500 font-mono">
            Security Guarantee: <span className="text-slate-400">LOGIN ID == RECORD ID == QR RECORD OWNER</span>
          </p>
        </div>
      </div>
    </div>
  );
};
