import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Experiment, LabRecord } from '../types';
import {
  Camera,
  Upload,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ArrowLeft,
  XCircle,
  Award,
  BookOpen,
  ClipboardCheck,
  Layers,
  Check,
  HelpCircle,
} from 'lucide-react';

export const SubmitRecord: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedExpId = searchParams.get('experimentId');

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [records, setRecords] = useState<LabRecord[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Two physical record images (Image 1: Index Row, Image 2: End-Box)
  const [image1File, setImage1File] = useState<File | null>(null);
  const [image1Preview, setImage1Preview] = useState<string | null>(null);
  const [image2File, setImage2File] = useState<File | null>(null);
  const [image2Preview, setImage2Preview] = useState<string | null>(null);

  // AI Verification State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Camera capture modal state
  const [activeCameraTarget, setActiveCameraTarget] = useState<'image1' | 'image2' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    loadData();
    return () => {
      stopCamera();
    };
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [exps, recs] = await Promise.all([
        api.getStudentExperiments(),
        api.getStudentRecords(),
      ]);
      setExperiments(exps);
      setRecords(recs);

      if (requestedExpId && exps.some((e) => e.id === requestedExpId)) {
        setSelectedExpId(requestedExpId);
      } else if (exps.length > 0) {
        // Preselect first unsubmitted or first experiment
        const unsubmitted = exps.find((e) => {
          const rec = recs.find((r) => r.experimentId === e.id);
          return !rec || rec.status !== 'VERIFIED';
        });
        setSelectedExpId(unsubmitted ? unsubmitted.id : exps[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load experiments:', err);
      setErrorMessage(err.message || 'Failed to load experiments');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedExperiment = experiments.find((e) => e.id === selectedExpId);
  const existingRecord = records.find((r) => r.experimentId === selectedExpId);

  // File selection handlers
  const handleFileSelect = (target: 'image1' | 'image2', file: File) => {
    const previewUrl = URL.createObjectURL(file);
    if (target === 'image1') {
      setImage1File(file);
      setImage1Preview(previewUrl);
    } else {
      setImage2File(file);
      setImage2Preview(previewUrl);
    }
    setAnalysisResult(null);
    setErrorMessage(null);
  };

  // Camera start / stop / snapshot
  const startCamera = async (target: 'image1' | 'image2') => {
    setActiveCameraTarget(target);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error('Unable to access camera:', err);
      setActiveCameraTarget(null);
      setErrorMessage('Camera access was denied or is not available on this device.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setActiveCameraTarget(null);
  };

  const captureCameraSnapshot = () => {
    if (!videoRef.current || !activeCameraTarget) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `${activeCameraTarget}_capture.jpg`, { type: 'image/jpeg' });
        handleFileSelect(activeCameraTarget, file);
      }
      stopCamera();
    }, 'image/jpeg', 0.95);
  };

  // Run AI Two-Image Analysis
  const handleRunAiAnalysis = async () => {
    if (!selectedExpId || !image1File || !image2File) {
      setErrorMessage('Please upload both Image 1 (Contents/Index Row) and Image 2 (End-of-Experiment Box).');
      return;
    }

    try {
      setIsAnalyzing(true);
      setErrorMessage(null);

      // Call experiment-level analyze endpoint
      const result = await api.analyzeExperimentSubmission(selectedExpId, image1File, image2File);
      setAnalysisResult(result);
    } catch (err: any) {
      console.error('AI analysis error:', err);
      setErrorMessage(err.message || 'AI verification failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Finalize Submission
  const handleFinalizeSubmission = async () => {
    if (!selectedExpId || !analysisResult) return;

    try {
      setIsSubmitting(true);
      await api.finalizeExperimentSubmission(selectedExpId);
      setSuccessMessage('Physical laboratory record submitted and recorded successfully!');
      setTimeout(() => {
        navigate('/student/dashboard');
      }, 1500);
    } catch (err: any) {
      console.error('Failed to submit:', err);
      setErrorMessage(err.message || 'Failed to submit evidence.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status computation for decision banner
  const getDecisionStatusBadge = () => {
    if (!analysisResult) return null;
    const status = analysisResult.studentStatus || analysisResult.ownershipStatus;

    if (status === 'VERIFIED' || status === 'PASS') {
      return {
        bg: 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300',
        icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />,
        title: 'Verified / Submission Accepted',
        desc: 'All physical record cross-checks, handwriting consistency, and mark parity were confirmed. No manual approval queue required.',
      };
    }

    if (status === 'BLOCKED' || status === 'REJECTED') {
      return {
        bg: 'bg-rose-950/70 border-rose-500/50 text-rose-300',
        icon: <ShieldAlert className="w-6 h-6 text-rose-400" />,
        title: 'Submission Blocked / Security Issue Detected',
        desc: analysisResult.reviewReason || 'Suspected document reuse, mark arithmetic discrepancy, or experiment mismatch.',
      };
    }

    if (status === 'RETAKE_REQUIRED') {
      return {
        bg: 'bg-amber-950/70 border-amber-500/50 text-amber-300',
        icon: <Camera className="w-6 h-6 text-amber-400" />,
        title: 'Retake Required / Poor Image Quality',
        desc: 'One or both photographs suffer from low lighting, severe motion blur, or partial cropping. Please retake clearer photos.',
      };
    }

    return {
      bg: 'bg-indigo-950/70 border-indigo-500/50 text-indigo-300',
      icon: <HelpCircle className="w-6 h-6 text-indigo-400" />,
      title: 'Insufficient Evidence / Accepted for Review',
      desc: 'Initial baseline submission with insufficient prior handwriting history. Your submission is accepted and forwarded for routine faculty review.',
    };
  };

  const decisionBadge = getDecisionStatusBadge();

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading laboratory experiments...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Navigation */}
      <button
        onClick={() => navigate('/student/dashboard')}
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to My Laboratory Records</span>
      </button>

      {/* Main Container */}
      <div className="glass-panel rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Two-Image Physical Record Verification Workflow</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Submit Laboratory Record
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Upload clear photographs of your laboratory notebook: the contents/index row and the final evaluation mark-box.
              SecureLab verifies document ownership and mark integrity automatically without QR codes.
            </p>
          </div>

          {/* Student Identity Pill (Read-only) */}
          <div className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Authenticated Student</div>
            <div className="text-sm font-bold text-white mt-0.5">{user?.name}</div>
            <div className="text-xs font-mono text-indigo-400">REG: {user?.registerNumber}</div>
          </div>
        </div>

        {/* Experiment Selector */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            Select Assigned Experiment
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {experiments.map((exp) => {
              const isSelected = exp.id === selectedExpId;
              const rec = records.find((r) => r.experimentId === exp.id);
              const isVerified = rec?.status === 'VERIFIED';

              return (
                <button
                  key={exp.id}
                  type="button"
                  onClick={() => {
                    setSelectedExpId(exp.id);
                    setAnalysisResult(null);
                    setErrorMessage(null);
                  }}
                  className={`text-left p-4 rounded-xl border transition relative overflow-hidden ${
                    isSelected
                      ? 'bg-indigo-950/50 border-indigo-500 shadow-lg shadow-indigo-600/10'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      EXP {exp.experimentNumber}
                    </span>
                    {isVerified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                        <Check className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-white line-clamp-1">{exp.title}</div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                    <span>End-Box: Page {exp.endBoxPageNumber || exp.experimentNumber * 20}</span>
                    <span className="font-semibold text-indigo-300">Max: {exp.maxMark || 10} M</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Faculty Academic Configuration Banner (Read-only) */}
        {selectedExperiment && (
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-slate-200 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span>EXP {selectedExperiment.experimentNumber}: {selectedExperiment.title}</span>
              </div>
              <div className="text-slate-400">
                Department: <span className="text-slate-300 font-medium">Electrical and Electronics Engineering</span> • Section: <span className="text-slate-300 font-medium">{user?.section || 'A'}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-6 shrink-0">
              <div>
                <span className="text-slate-500 block text-[10px]">CONFIGURED END-BOX</span>
                <span className="font-mono font-bold text-indigo-300 text-sm">
                  Page {selectedExperiment.endBoxPageNumber || selectedExperiment.experimentNumber * 20}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">MAXIMUM MARK</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {selectedExperiment.maxMark || 10.0} Marks
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Two Images Upload Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* IMAGE 1: Index Row */}
          <div className="glass-card rounded-xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/30">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    IMAGE 1 — CONTENTS / INDEX ROW
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Row corresponding to Experiment {selectedExperiment?.experimentNumber || ''}
                  </p>
                </div>
              </div>
              {image1File && (
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                  <Check className="w-3 h-3" /> Ready
                </span>
              )}
            </div>

            {/* Preview or Dropzone */}
            {image1Preview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black aspect-video flex items-center justify-center group">
                <img
                  src={image1Preview}
                  alt="Image 1 Index Row Preview"
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3">
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect('image1', e.target.files[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setImage1File(null);
                      setImage1Preview(null);
                      setAnalysisResult(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-xl p-6 text-center transition bg-slate-900/40 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
                  <BookOpen className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-200">
                    Upload Photograph of Index Row
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Capture the notebook's index page showing Experiment {selectedExperiment?.experimentNumber} title, date, and mark.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <label className="cursor-pointer px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose File</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect('image1', e.target.files[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => startCamera('image1')}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Camera</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* IMAGE 2: End-of-Experiment Box */}
          <div className="glass-card rounded-xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/30">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <ClipboardCheck className="w-4 h-4 text-indigo-400" />
                    IMAGE 2 — EVALUATION BOX
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Final evaluation mark-box (expected Page {selectedExperiment?.endBoxPageNumber || selectedExperiment?.experimentNumber ? selectedExperiment?.endBoxPageNumber || selectedExperiment?.experimentNumber * 20 : ''})
                  </p>
                </div>
              </div>
              {image2File && (
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                  <Check className="w-3 h-3" /> Ready
                </span>
              )}
            </div>

            {/* Preview or Dropzone */}
            {image2Preview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-black aspect-video flex items-center justify-center group">
                <img
                  src={image2Preview}
                  alt="Image 2 End-Box Preview"
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3">
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect('image2', e.target.files[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setImage2File(null);
                      setImage2Preview(null);
                      setAnalysisResult(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-xl p-6 text-center transition bg-slate-900/40 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
                  <ClipboardCheck className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-200">
                    Upload Photograph of Evaluation Box
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Capture the end-of-experiment mark-box showing Pre-Lab, Execution, Result, Record, and Total marks.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <label className="cursor-pointer px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose File</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect('image2', e.target.files[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => startCamera('image2')}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Camera</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Button: AI ANALYSE */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            {image1File && image2File
              ? '✓ Both physical pages are selected and ready for AI verification.'
              : '⚠️ Please select both required physical notebook images to enable AI verification.'}
          </div>

          <button
            type="button"
            disabled={!image1File || !image2File || isAnalyzing}
            onClick={handleRunAiAnalysis}
            className={`px-8 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2.5 transition shadow-lg ${
              !image1File || !image2File || isAnalyzing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-600/30'
            }`}
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Analysing Both Pages Together...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>AI ANALYSE</span>
              </>
            )}
          </button>
        </div>

        {/* Error / Feedback alerts */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-rose-200">Verification Issue</div>
              <div>{errorMessage}</div>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-emerald-200">Submission Recorded</div>
              <div>{successMessage}</div>
            </div>
          </div>
        )}

        {/* AI Analysis Result Panel */}
        {analysisResult && decisionBadge && (
          <div className="space-y-6 pt-4 border-t border-slate-800">
            {/* Decision Status Banner */}
            <div className={`p-6 rounded-2xl border ${decisionBadge.bg} transition`}>
              <div className="flex items-start gap-4">
                <div className="shrink-0 p-2 rounded-xl bg-black/30 border border-white/10">
                  {decisionBadge.icon}
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold tracking-tight text-white">{decisionBadge.title}</h2>
                  <p className="text-xs leading-relaxed opacity-90">{decisionBadge.desc}</p>
                </div>
              </div>
            </div>

            {/* Verification Signals Checklist */}
            <div className="glass-card rounded-xl p-5 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Multi-Signal Physical Evidence Analysis
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* 1. Experiment match */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Experiment ID</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">EXP {selectedExperiment?.experimentNumber}</span>
                    <span className={`text-[11px] font-bold ${analysisResult.summary.experimentMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {analysisResult.summary.experimentMatch ? 'MATCH' : 'MISMATCH'}
                    </span>
                  </div>
                </div>

                {/* 2. Page Range match */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">End-Box Page</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">
                      Page {selectedExperiment?.endBoxPageNumber || (selectedExperiment ? selectedExperiment.experimentNumber * 20 : 20)}
                    </span>
                    <span className={`text-[11px] font-bold ${analysisResult.summary.pageRangeMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {analysisResult.summary.pageRangeMatch ? 'CONSISTENT' : 'VARIANCE'}
                    </span>
                  </div>
                </div>

                {/* 3. Mark consistency */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Mark Parity</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">
                      Idx: {analysisResult.markDetails?.indexMark ?? '-'} / Box: {analysisResult.markDetails?.endBoxTotal ?? '-'}
                    </span>
                    <span className={`text-[11px] font-bold ${analysisResult.summary.markConsistent ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {analysisResult.summary.markConsistent ? 'MATCH' : 'MISMATCH'}
                    </span>
                  </div>
                </div>

                {/* 4. Arithmetic check */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Arithmetic Sum</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">
                      Sum: {analysisResult.markDetails?.computedTotal ?? '-'}
                    </span>
                    <span className={`text-[11px] font-bold ${analysisResult.summary.arithmeticConsistent ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {analysisResult.summary.arithmeticConsistent ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>

                {/* 5. Document reuse detection */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Document Reuse</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">Hash & Layout</span>
                    <span className={`text-[11px] font-bold ${!analysisResult.summary.exactReuse && !analysisResult.summary.visualReuse ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {!analysisResult.summary.exactReuse && !analysisResult.summary.visualReuse ? 'NONE (ORIGINAL)' : 'REUSE DETECTED'}
                    </span>
                  </div>
                </div>

                {/* 6. Writer consistency */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Writer Consistency</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">Handwriting</span>
                    <span className="text-[11px] font-bold text-indigo-300">
                      {analysisResult.writerProfile?.consistency || 'CONSISTENT'}
                    </span>
                  </div>
                </div>

                {/* 7. Image quality */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Image Sharpness</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">Quality Gate</span>
                    <span className={`text-[11px] font-bold ${analysisResult.summary.qualityPass ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {analysisResult.summary.qualityPass ? 'PASS' : 'REVIEW'}
                    </span>
                  </div>
                </div>

                {/* 8. Faculty signature */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Faculty Signature</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-bold text-white">Record Box</span>
                    <span className={`text-[11px] font-bold ${analysisResult.summary.facultySignaturePresent ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {analysisResult.summary.facultySignaturePresent ? 'PRESENT' : 'OPTIONAL'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Final Submission Confirmation Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                {analysisResult.studentStatus === 'BLOCKED'
                  ? '⚠️ Security checks detected an ownership conflict. This submission cannot be automatically verified.'
                  : 'Ready to submit. Click below to register your physical evidence in the laboratory ledger.'}
              </div>

              <button
                type="button"
                disabled={isSubmitting || analysisResult.studentStatus === 'BLOCKED'}
                onClick={handleFinalizeSubmission}
                className={`px-8 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-xl ${
                  analysisResult.studentStatus === 'BLOCKED'
                    ? 'bg-rose-900/50 text-rose-400 cursor-not-allowed border border-rose-800/50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Recording Evidence...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>SUBMIT EVIDENCE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Camera Capture Modal */}
      {activeCameraTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="font-bold text-white text-base flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-400" />
                <span>Capture {activeCameraTarget === 'image1' ? 'Index Row' : 'Evaluation Box'}</span>
              </div>
              <button
                onClick={stopCamera}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={stopCamera}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureCameraSnapshot}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
              >
                <Camera className="w-4 h-4" />
                <span>Capture Photo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
