import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { LabRecord, Experiment } from '../types';
import {
  GraduationCap,
  FlaskConical,
  Camera,
  Award,
  Clock,
  ShieldCheck,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Layers,
} from 'lucide-react';

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [records, setRecords] = useState<LabRecord[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const [recs, exps] = await Promise.all([
        api.getStudentRecords(),
        api.getStudentExperiments(),
      ]);
      setRecords(recs);
      setExperiments(exps);
    } catch (err) {
      console.error('Failed to load student dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Metrics calculation
  const totalExps = experiments.length;
  const verifiedRecords = records.filter((r) => r.status === 'VERIFIED');
  const totalVerifiedMarks = verifiedRecords.reduce((acc, r) => acc + (r.detectedMark || 0), 0);
  const averageMark = verifiedRecords.length > 0 ? (totalVerifiedMarks / verifiedRecords.length).toFixed(1) : '-';

  const getStatusBadge = (record?: LabRecord) => {
    if (!record) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
          <Clock className="w-3.5 h-3.5" /> Not Submitted
        </span>
      );
    }

    switch (record.status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Verified / Accepted
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-950/70 text-rose-300 border border-rose-500/40">
            <XCircle className="w-3.5 h-3.5 text-rose-400" /> Blocked
          </span>
        );
      case 'MANUAL_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/70 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Insufficient Evidence
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/70 text-indigo-300 border border-indigo-500/40">
            <Clock className="w-3.5 h-3.5 text-indigo-400" /> Submitted
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Student Profile Card */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 mb-8 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <FlaskConical className="w-48 h-48 text-indigo-400" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/25 shrink-0">
              <GraduationCap className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">{user?.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  REG: {user?.registerNumber}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                {user?.className || 'III B.E. Electrical & Electronics Engineering'} • Section {user?.section || 'A'}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Authenticated Student Physical Record Assessment Active</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/student/submit-record')}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition"
            >
              <Camera className="w-4 h-4" />
              <span>Submit Experiment Pages</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400">Total Experiments</div>
            <div className="text-xl font-bold text-white mt-1">{totalExps}</div>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-emerald-400">Verified Submissions</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{verifiedRecords.length}</div>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-indigo-400">Average Mark</div>
            <div className="text-xl font-bold text-indigo-400 mt-1">
              {averageMark} <span className="text-xs text-slate-500 font-normal">/ 10</span>
            </div>
          </div>
        </div>
      </div>

      {/* Laboratory Experiments List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-indigo-400" />
              MY LABORATORY RECORDS
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select an experiment to upload your two notebook images (Contents/Index Row & Evaluation Box). No QR codes required.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading laboratory experiments...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {experiments.map((exp) => {
              const record = records.find((r) => r.experimentId === exp.id);
              const isVerified = record?.status === 'VERIFIED';
              const endBoxPage = exp.endBoxPageNumber || exp.experimentNumber * 20;

              return (
                <div
                  key={exp.id}
                  className="glass-card rounded-2xl p-5 sm:p-6 border border-slate-800 hover:border-slate-700 transition shadow-lg"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Experiment details */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          EXPERIMENT {exp.experimentNumber}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">{exp.subject}</span>
                      </div>
                      <h3 className="text-base font-bold text-white">{exp.title}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                        {exp.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                        <span className="text-slate-400 font-mono bg-slate-900 px-2.5 py-1 rounded border border-slate-800 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                          Configured End-Box: <strong className="text-slate-200">Page {endBoxPage}</strong>
                        </span>
                        <span className="text-slate-400 font-mono bg-slate-900 px-2.5 py-1 rounded border border-slate-800 flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5 text-emerald-400" />
                          Maximum Mark: <strong className="text-slate-200">{exp.maxMark || 10.0} Marks</strong>
                        </span>
                        {isVerified && record?.detectedMark !== null && (
                          <span className="text-emerald-300 font-semibold bg-emerald-950/50 px-2.5 py-1 rounded border border-emerald-800/50">
                            Awarded Mark: {record.detectedMark} / {exp.maxMark || 10}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status & Submission Action */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-slate-800 lg:pl-6">
                      <div className="min-w-[130px]">
                        {getStatusBadge(record)}
                      </div>

                      <button
                        onClick={() => navigate(`/student/submit-record?experimentId=${exp.id}`)}
                        className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 shadow-md ${
                          isVerified
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{isVerified ? 'Resubmit / View' : 'Submit Two Images'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
