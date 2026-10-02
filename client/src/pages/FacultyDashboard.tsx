import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { LabRecord, AuditLog, Experiment, User, StudentRosterImportResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { FacultyOwnershipReview } from '../components/FacultyOwnershipReview';
import {
  School,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  Check,
  X,
  History,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  Award,
  Users,
  FileSpreadsheet,
  Download,
  BookOpen,
  ClipboardCheck,
  Layers,
  Upload,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

export const FacultyDashboard: React.FC = () => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'experiments' | 'roster' | 'records' | 'audits'>('experiments');
  const [records, setRecords] = useState<LabRecord[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected Record for Ownership Verification Review Modal
  const [ownershipReviewRecord, setOwnershipReviewRecord] = useState<LabRecord | null>(null);

  // Experiment Creation Modal State
  const [isCreateExpOpen, setIsCreateExpOpen] = useState(false);
  const [newExpNumber, setNewExpNumber] = useState<number>(1);
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpSubject, setNewExpSubject] = useState('Electrical Machines Laboratory');
  const [newExpDesc, setNewExpDesc] = useState('');
  const [newExpEndBoxPage, setNewExpEndBoxPage] = useState<number>(12);
  const [newExpMaxMark, setNewExpMaxMark] = useState<number>(10);
  const [isSubmittingExp, setIsSubmittingExp] = useState(false);

  // Student Excel Import Modal State
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [importSummary, setImportSummary] = useState<StudentRosterImportResult | null>(null);

  // Notification Toast Message
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const [dashData, expData, studentsData] = await Promise.all([
        api.getFacultyDashboard(),
        api.getFacultyExperiments ? api.getFacultyExperiments() : api.getStudentExperiments(),
        api.getFacultyStudents(),
      ]);

      setRecords(dashData.records || []);
      setAuditLogs(dashData.recentAudits || []);
      setExperiments(expData || []);
      setStudents(studentsData || []);

      if (expData && expData.length > 0) {
        setNewExpNumber(expData.length + 1);
        setNewExpEndBoxPage((expData.length + 1) * 8);
      }
    } catch (err: any) {
      console.error('Failed to load faculty dashboard:', err);
      showToast(err.message || 'Failed to load dashboard data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Create Experiment Handler
  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpTitle.trim()) {
      showToast('Experiment title is required', 'error');
      return;
    }

    try {
      setIsSubmittingExp(true);
      const created = await api.createExperiment({
        experimentNumber: Number(newExpNumber),
        title: newExpTitle.trim(),
        subject: newExpSubject.trim(),
        description: newExpDesc.trim(),
        endBoxPageNumber: Number(newExpEndBoxPage),
        maxMark: Number(newExpMaxMark),
        isActive: true,
      });

      setExperiments((prev) => [...prev, created]);
      setIsCreateExpOpen(false);
      setNewExpTitle('');
      setNewExpDesc('');
      setNewExpNumber(experiments.length + 2);
      setNewExpEndBoxPage((experiments.length + 2) * 8);
      showToast(`Experiment ${created.experimentNumber}: "${created.title}" successfully configured!`);
    } catch (err: any) {
      console.error('Failed to create experiment:', err);
      showToast(err.message || 'Failed to create experiment', 'error');
    } finally {
      setIsSubmittingExp(false);
    }
  };

  // Import Student Roster Excel Handler
  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) {
      showToast('Please select a valid Excel (.xlsx) spreadsheet', 'error');
      return;
    }

    try {
      setIsImportingExcel(true);
      const result: StudentRosterImportResult = await api.importStudentsExcel(excelFile);
      setImportSummary(result);
      showToast(`Roster imported: ${result.created} created, ${result.updated} updated.`);
      // Reload students
      const updatedStudents = await api.getFacultyStudents();
      setStudents(updatedStudents);
    } catch (err: any) {
      console.error('Failed to import Excel:', err);
      showToast(err.message || 'Failed to import student roster Excel', 'error');
    } finally {
      setIsImportingExcel(false);
    }
  };

  // Export Assessment Excel Handler
  const handleExportAssessmentExcel = async () => {
    try {
      const token = localStorage.getItem('token');
      // If sessions exist, use first session export, else invoke general export
      const sessId = records[0]?.labSessionId || 'session-12';
      const response = await fetch(`/api/faculty/sessions/${sessId}/export-excel`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Failed to generate Excel export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EEE_Continuous_Assessment_Marks_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Continuous assessment marksheet exported successfully.');
    } catch (err: any) {
      console.error('Export error:', err);
      showToast(err.message || 'Failed to export assessment Excel', 'error');
    }
  };

  // Filtered Submissions
  const filteredRecords = records.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const studentName = r.student?.name?.toLowerCase() || '';
      const reg = r.student?.registerNumber?.toLowerCase() || r.detectedStudentRegisterNumber?.toLowerCase() || '';
      const expTitle = r.experiment?.title?.toLowerCase() || '';
      return studentName.includes(q) || reg.includes(q) || expTitle.includes(q);
    }
    return true;
  });

  // Summary Metrics
  const totalSubmissions = records.filter((r) => r.status !== 'PENDING' || r.imagePath).length;
  const verifiedCount = records.filter((r) => r.status === 'VERIFIED').length;
  const reviewCount = records.filter((r) => r.status === 'MANUAL_REVIEW').length;
  const blockedCount = records.filter((r) => r.status === 'REJECTED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl border text-xs font-semibold shadow-2xl transition flex items-center gap-2 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
              : 'bg-rose-950 border-rose-500 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/25 shrink-0">
              <School className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">Faculty Master Control Center</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  EEE Department
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Electrical Machines & Circuits Laboratory • Academic Year 2026–2027 • III EEE Section A
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Automated Student Misuse Prevention & Continuous Evaluation Active</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsImportExcelOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-2 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Upload Student Excel</span>
            </button>
            <button
              onClick={() => setIsCreateExpOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Configure Experiment</span>
            </button>
            <button
              onClick={handleExportAssessmentExcel}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              <span>Export EEE Excel</span>
            </button>
          </div>
        </div>

        {/* Top Summary Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400">Total Experiments</div>
            <div className="text-xl font-bold text-white mt-1">{experiments.length}</div>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-emerald-400">Verified & Accepted</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{verifiedCount}</div>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-amber-400">Manual Review Flagged</div>
            <div className="text-xl font-bold text-amber-400 mt-1">{reviewCount}</div>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="text-xs text-rose-400">Blocked / Suspected Reuse</div>
            <div className="text-xl font-bold text-rose-400 mt-1">{blockedCount}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('experiments')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'experiments'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Experiment Master ({experiments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('roster')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'roster'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Student Roster ({students.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('records')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'records'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Submissions & Monitoring ({records.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('audits')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'audits'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Security Audit Trail</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: EXPERIMENT MASTER */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'experiments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Semester Experiment Definitions
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Faculty defines all experiment structures at start of semester. Configured end-box page numbers are strictly enforced.
              </p>
            </div>
            <button
              onClick={() => setIsCreateExpOpen(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Experiment</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {experiments.map((exp) => (
              <div
                key={exp.id}
                className="glass-card rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    EXP {exp.experimentNumber}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                    Max: {exp.maxMark || 10.0} Marks
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white line-clamp-1">{exp.title}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {exp.description || 'Continuous laboratory practical experiment.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="text-slate-400">
                    End-Box Target: <strong className="text-indigo-300 font-mono">Page {exp.endBoxPageNumber || exp.experimentNumber * 20}</strong>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-mono">Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: STUDENT ROSTER & EXCEL IMPORT */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Class Student Master Roster
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Students are maintained through faculty Excel imports. No manual student profile typing permitted.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => api.downloadStudentTemplateExcel()}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Template .xlsx</span>
              </button>
              <button
                onClick={() => setIsImportExcelOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Excel</span>
              </button>
            </div>
          </div>

          {/* Student Table */}
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Register No</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Section</th>
                    <th className="py-3 px-4">Verified Submissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {students.map((student) => {
                    const studentVerified = records.filter((r) => r.studentId === student.id && r.status === 'VERIFIED').length;
                    return (
                      <tr key={student.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-300">{student.registerNumber}</td>
                        <td className="py-3 px-4 font-semibold text-white">{student.name}</td>
                        <td className="py-3 px-4 text-slate-400">{student.email}</td>
                        <td className="py-3 px-4">{student.className || 'III EEE'}</td>
                        <td className="py-3 px-4">Section {student.section || 'A'}</td>
                        <td className="py-3 px-4 font-semibold text-emerald-400">{studentVerified} Verified</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: SUBMISSIONS & MONITORING */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-indigo-400" />
                Physical Notebook Submissions & Verification Ledger
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect submitted notebook photographs, multi-signal AI decisions, and mark parity.
              </p>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs rounded-xl px-3 py-1.5 text-slate-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="VERIFIED">Verified</option>
                <option value="MANUAL_REVIEW">Manual Review</option>
                <option value="REJECTED">Blocked / Rejected</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Experiment</th>
                    <th className="py-3 px-4">Mark</th>
                    <th className="py-3 px-4">Verification Result</th>
                    <th className="py-3 px-4">Submission Date</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No laboratory submissions match current criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{r.student?.name || 'Student'}</div>
                          <div className="text-[11px] font-mono text-indigo-400">REG: {r.student?.registerNumber || r.detectedStudentRegisterNumber || '048'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">EXP {r.experiment?.experimentNumber || 4}: {r.experiment?.title || 'Experiment'}</div>
                          <div className="text-[11px] text-slate-500">Expected End-Box: Page {r.experiment?.endBoxPageNumber || 32}</div>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold">
                          {r.detectedMark !== null ? (
                            <span className="text-emerald-400">{r.detectedMark} / {r.maxMark || 10}</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={r.status} />
                          {r.manualReviewReason && (
                            <div className="text-[10px] text-rose-400 max-w-xs mt-0.5 line-clamp-1">
                              {r.manualReviewReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {r.submissionTimestamp ? new Date(r.submissionTimestamp).toLocaleString() : 'Recent'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setOwnershipReviewRecord(r)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 transition font-semibold text-[11px]"
                          >
                            Inspect Evidence
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 4: AUDIT LOGS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'audits' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                Immutable Security & Audit Trail
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete tamper-evident log of student submissions, AI decisions, document reuse detections, and faculty actions.
              </p>
            </div>
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 divide-y divide-slate-800/60 overflow-hidden shadow-xl text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-slate-900/40 transition flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-300">{log.action}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {log.actorType}
                    </span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Entity: {log.entityType} ({log.entityId})
                  </div>
                  {log.metadata && (
                    <div className="text-[10px] font-mono text-slate-500 bg-slate-950 p-2 rounded border border-slate-900 max-w-2xl overflow-x-auto">
                      {typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono shrink-0">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: CREATE EXPERIMENT MASTER */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isCreateExpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                <span>Configure New Laboratory Experiment</span>
              </h3>
              <button onClick={() => setIsCreateExpOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExperiment} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Experiment Number *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newExpNumber}
                    onChange={(e) => setNewExpNumber(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">End-Box Page Number *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newExpEndBoxPage}
                    onChange={(e) => setNewExpEndBoxPage(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-indigo-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Experiment Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Verification of Ohm's Law"
                  value={newExpTitle}
                  onChange={(e) => setNewExpTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Subject / Lab</label>
                  <input
                    type="text"
                    value={newExpSubject}
                    onChange={(e) => setNewExpSubject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Maximum Mark</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newExpMaxMark}
                    onChange={(e) => setNewExpMaxMark(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Short Description (Optional)</label>
                <textarea
                  rows={2}
                  value={newExpDesc}
                  onChange={(e) => setNewExpDesc(e.target.value)}
                  placeholder="Experimental procedure and evaluation criteria..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateExpOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExp}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5"
                >
                  {isSubmittingExp ? 'Saving...' : 'Save Experiment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: UPLOAD STUDENT EXCEL */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isImportExcelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>Upload Class Student Master List</span>
              </h3>
              <button
                onClick={() => {
                  setIsImportExcelOpen(false);
                  setImportSummary(null);
                  setExcelFile(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importSummary ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 space-y-2">
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Import Completed Successfully</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-300 pt-2 border-t border-emerald-800/40">
                    <div>Total Processed: <strong>{importSummary.totalRows}</strong></div>
                    <div>Imported Records: <strong>{importSummary.imported}</strong></div>
                    <div>Newly Created: <strong>{importSummary.created}</strong></div>
                    <div>Updated Existing: <strong>{importSummary.updated}</strong></div>
                    <div>Skipped / Errors: <strong>{importSummary.skipped}</strong></div>
                  </div>
                </div>

                {importSummary.errors.length > 0 && (
                  <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 space-y-1">
                    <div className="font-bold">Errors encountered:</div>
                    {importSummary.errors.map((err, i) => (
                      <div key={i} className="text-[11px]">• {err}</div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportExcelOpen(false);
                      setImportSummary(null);
                      setExcelFile(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleImportExcel} className="space-y-4 text-xs">
                <p className="text-slate-400 leading-relaxed">
                  Upload an Excel file (.xlsx) containing columns: <strong>Register Number</strong>, <strong>Student Name</strong>, <strong>Email</strong>, <strong>Section</strong>, and <strong>Batch</strong>.
                </p>

                <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-6 text-center space-y-3 bg-slate-950">
                  <FileSpreadsheet className="w-10 h-10 text-emerald-400 mx-auto" />
                  <div>
                    <span className="font-semibold text-white block">
                      {excelFile ? excelFile.name : 'Choose student roster spreadsheet'}
                    </span>
                    <span className="text-[11px] text-slate-500">.xlsx or .xls files supported</span>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => e.target.files?.[0] && setExcelFile(e.target.files[0])}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => api.downloadStudentTemplateExcel()}
                    className="text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Excel Template</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsImportExcelOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!excelFile || isImportingExcel}
                      className={`px-5 py-2 rounded-xl text-white font-semibold flex items-center gap-1.5 ${
                        !excelFile || isImportingExcel ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'
                      }`}
                    >
                      {isImportingExcel ? 'Importing Roster...' : 'Upload & Process'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 3: OWNERSHIP REVIEW */}
      {/* ───────────────────────────────────────────────────────────── */}
      {ownershipReviewRecord && (
        <FacultyOwnershipReview
          recordId={ownershipReviewRecord.id}
          recordCode={ownershipReviewRecord.uniqueRecordCode}
          studentName={ownershipReviewRecord.student?.name}
          onClose={() => setOwnershipReviewRecord(null)}
          onAction={() => {
            setOwnershipReviewRecord(null);
            loadDashboard();
          }}
        />
      )}
    </div>
  );
};
