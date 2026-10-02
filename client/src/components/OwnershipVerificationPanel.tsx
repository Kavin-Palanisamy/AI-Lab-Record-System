/**
 * Phase 7: Document Ownership Verification Panel
 *
 * Two-image submission interface for students:
 *  - image1: Contents / Index row
 *  - image2: End-of-experiment evaluation box
 *
 * Displays structured ownership evidence in a clear dashboard.
 * Never exposes other students' identity.
 */

import React, { useState } from 'react';
import {
  Upload,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Eye,
  ClipboardList,
  User,
  Hash,
  BookOpen,
  PenLine,
  RefreshCw,
  Search,
  Award,
} from 'lucide-react';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface OwnershipSummary {
  experimentMatch:         boolean;
  pageRangeMatch:          boolean;
  dateMatch:               boolean | null;
  markConsistent:          boolean;
  arithmeticConsistent:    boolean;
  qualityPass:             boolean;
  facultySignaturePresent: boolean;
  exactReuseDetected:      boolean;
  visualReuseDetected:     boolean;
  writerConsistent:        boolean | null;
  crossPageConsistent:     boolean | null;
}

interface MarkDetails {
  indexMark:       number | null;
  endBoxTotal:     number | null;
  computedTotal:   number | null;
  consistent:      boolean;
  arithmeticMatch: boolean;
}

interface ExperimentDetails {
  expectedExperimentNumber:  number;
  detectedExperimentNumber:  number | null;
  pageRangeMatch:            boolean;
  dateMatch:                 boolean | null;
}

interface WriterProfile {
  state:       string;
  consistency: string | null;
  crossPage:   string | null;
}

interface OwnershipAnalysisResult {
  ownershipStatus: 'PASS' | 'MANUAL_REVIEW' | 'REJECTED';
  riskLevel:       'LOW' | 'MEDIUM' | 'HIGH';
  summary:         OwnershipSummary;
  markDetails:     MarkDetails;
  experimentDetails: ExperimentDetails;
  writerProfile:   WriterProfile;
  reviewMessage:   string;
  reviewReason?:   string;
}

interface Props {
  recordId:   string;
  recordCode: string;
  onClose?:   () => void;
}

// ─── Signal Row Component ─────────────────────────────────────────────────────
const SignalRow: React.FC<{
  label:  string;
  value:  boolean | null | string;
  good?:  string;
  bad?:   string;
  icon?:  React.ReactNode;
}> = ({ label, value, good = 'Yes', bad = 'No', icon }) => {
  const isGood = value === true || value === 'CONSISTENT' || value === 'DATE_MATCH' || value === 'PASS';
  const isNull = value === null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 14px',
      borderRadius: '8px',
      background: isNull
        ? 'rgba(148, 163, 184, 0.08)'
        : isGood
          ? 'rgba(16, 185, 129, 0.08)'
          : 'rgba(239, 68, 68, 0.08)',
      border: `1px solid ${isNull
        ? 'rgba(148, 163, 184, 0.2)'
        : isGood
          ? 'rgba(16, 185, 129, 0.25)'
          : 'rgba(239, 68, 68, 0.25)'}`,
    }}>
      <div style={{ color: isNull ? '#94a3b8' : isGood ? '#10b981' : '#ef4444', flexShrink: 0 }}>
        {isNull
          ? <AlertTriangle size={16} />
          : isGood
            ? <CheckCircle2 size={16} />
            : <XCircle size={16} />}
      </div>
      {icon && <div style={{ color: '#94a3b8', flexShrink: 0 }}>{icon}</div>}
      <div style={{ flex: 1 }}>
        <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{
        fontSize: '12px',
        fontWeight: 600,
        color: isNull ? '#94a3b8' : isGood ? '#10b981' : '#ef4444',
        padding: '2px 8px',
        borderRadius: '4px',
        background: isNull
          ? 'rgba(148, 163, 184, 0.1)'
          : isGood
            ? 'rgba(16, 185, 129, 0.15)'
            : 'rgba(239, 68, 68, 0.15)',
      }}>
        {isNull ? 'N/A' : value === true ? good : value === false ? bad : String(value)}
      </div>
    </div>
  );
};

// ─── Image Upload Drop Zone ───────────────────────────────────────────────────
const ImageDropZone: React.FC<{
  label:       string;
  description: string;
  file:        File | null;
  onFile:      (f: File) => void;
  icon:        React.ReactNode;
}> = ({ label, description, file, onFile, icon }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) onFile(f);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${isDragging ? '#6366f1' : file ? '#10b981' : '#334155'}`,
        borderRadius: '12px',
        padding: '24px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.2s ease',
        background: isDragging
          ? 'rgba(99, 102, 241, 0.06)'
          : file
            ? 'rgba(16, 185, 129, 0.06)'
            : 'rgba(30, 41, 59, 0.5)',
        position: 'relative',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <div style={{ marginBottom: '8px', color: file ? '#10b981' : '#6366f1' }}>{icon}</div>
      <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '4px', fontSize: '14px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{description}</div>
      {file ? (
        <div style={{
          fontSize: '12px',
          color: '#10b981',
          padding: '4px 10px',
          borderRadius: '6px',
          background: 'rgba(16, 185, 129, 0.1)',
          display: 'inline-block',
        }}>
          ✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)
        </div>
      ) : (
        <div style={{
          fontSize: '12px',
          color: '#475569',
          padding: '4px 10px',
          borderRadius: '6px',
          background: 'rgba(51, 65, 85, 0.5)',
          display: 'inline-block',
        }}>
          Click to browse or drag & drop
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const OwnershipVerificationPanel: React.FC<Props> = ({ recordId, recordCode, onClose }) => {
  const [image1, setImage1] = useState<File | null>(null);
  const [image2, setImage2] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<OwnershipAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!image1 || !image2) {
      setError('Please select both images before analyzing.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('image1', image1);
      formData.append('image2', image2);

      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/student/records/${recordId}/ownership-analysis`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Analysis failed');
      }

      setResult(data.data);
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const statusColor = result?.ownershipStatus === 'PASS'
    ? '#10b981'
    : result?.ownershipStatus === 'MANUAL_REVIEW'
      ? '#f59e0b'
      : '#ef4444';

  const statusIcon = result?.ownershipStatus === 'PASS'
    ? <ShieldCheck size={28} />
    : result?.ownershipStatus === 'MANUAL_REVIEW'
      ? <ShieldAlert size={28} />
      : <XCircle size={28} />;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(99, 102, 241, 0.25)',
      borderRadius: '16px',
      padding: '28px',
      maxWidth: '760px',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Search size={20} color="#6366f1" />
            <h2 style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: 700, margin: 0 }}>
              Document Ownership Verification
            </h2>
          </div>
          <div style={{ color: '#64748b', fontSize: '13px' }}>
            Record: <span style={{ color: '#6366f1', fontFamily: 'monospace', fontWeight: 600 }}>{recordCode}</span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        )}
      </div>

      {/* Instruction Banner */}
      <div style={{
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: '10px',
        padding: '14px 16px',
        marginBottom: '24px',
        fontSize: '13px',
        color: '#94a3b8',
        lineHeight: 1.6,
      }}>
        <strong style={{ color: '#6366f1' }}>How to submit:</strong> Take two clear photographs of your physical laboratory record notebook. Image 1 should show the <strong style={{ color: '#c4b5fd' }}>Contents / Index page row</strong> for this experiment. Image 2 should show the <strong style={{ color: '#c4b5fd' }}>End-of-experiment evaluation / mark box</strong>.
      </div>

      {/* Image Upload Zone */}
      {!result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <ImageDropZone
            label="Image 1 — Contents / Index"
            description="Contents page row for this experiment"
            file={image1}
            onFile={setImage1}
            icon={<ClipboardList size={32} />}
          />
          <ImageDropZone
            label="Image 2 — Evaluation Box"
            description="End-of-experiment mark breakdown"
            file={image2}
            onFile={setImage2}
            icon={<BookOpen size={32} />}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: '#fca5a5',
          fontSize: '13px',
          marginBottom: '16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Analyze Button */}
      {!result && (
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !image1 || !image2}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            background: (!image1 || !image2)
              ? 'rgba(99, 102, 241, 0.3)'
              : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white',
            fontSize: '15px',
            fontWeight: 700,
            cursor: (!image1 || !image2) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Analyzing Documents...
            </>
          ) : (
            <>
              <Search size={18} />
              Verify Document Ownership
            </>
          )}
        </button>
      )}

      {/* Results Panel */}
      {result && (
        <div>
          {/* Status Banner */}
          <div style={{
            background: `${statusColor}18`,
            border: `1.5px solid ${statusColor}40`,
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            <div style={{ color: statusColor }}>{statusIcon}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '18px', color: statusColor, letterSpacing: '0.5px' }}>
                {result.ownershipStatus === 'PASS'
                  ? 'Evidence Accepted'
                  : result.ownershipStatus === 'MANUAL_REVIEW'
                    ? 'Faculty Verification Required'
                    : 'Submission Rejected'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
                {result.reviewMessage}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>RISK LEVEL</div>
              <div style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                background: result.riskLevel === 'LOW'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : result.riskLevel === 'MEDIUM'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                color: result.riskLevel === 'LOW'
                  ? '#10b981'
                  : result.riskLevel === 'MEDIUM'
                    ? '#f59e0b'
                    : '#ef4444',
              }}>
                {result.riskLevel}
              </div>
            </div>
          </div>

          {/* Signal Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            <SignalRow label="Experiment Match"       value={result.summary.experimentMatch}       good="Correct"    bad="Mismatch" icon={<FileText size={14} />} />
            <SignalRow label="Page Range"             value={result.summary.pageRangeMatch}        good="Within Range" bad="Out of Range" icon={<Hash size={14} />} />
            <SignalRow label="Session Date"           value={result.summary.dateMatch}             good="Match"      bad="Mismatch"   icon={<Eye size={14} />} />
            <SignalRow label="Mark Consistency"       value={result.summary.markConsistent}        good="Match"      bad="Mismatch"   icon={<Award size={14} />} />
            <SignalRow label="Mark Arithmetic"        value={result.summary.arithmeticConsistent}  good="Correct"    bad="Error"      icon={<Hash size={14} />} />
            <SignalRow label="Image Quality"          value={result.summary.qualityPass}           good="Pass"       bad="Fail"       icon={<Eye size={14} />} />
            <SignalRow label="Faculty Signature"      value={result.summary.facultySignaturePresent} good="Present"  bad="Not Found"  icon={<User size={14} />} />
            <SignalRow label="Exact Image Reuse"      value={!result.summary.exactReuseDetected}   good="Clean"      bad="Detected"   icon={<ShieldAlert size={14} />} />
            <SignalRow label="Visual Similarity"      value={!result.summary.visualReuseDetected}  good="Unique"     bad="Similar"    icon={<Search size={14} />} />
            <SignalRow label="Writing Consistency"    value={result.summary.writerConsistent === null ? null : result.summary.writerConsistent} good="Consistent" bad="Inconsistent" icon={<PenLine size={14} />} />
            <SignalRow label="Cross-Page Writing"     value={result.summary.crossPageConsistent === null ? null : result.summary.crossPageConsistent} good="Consistent" bad="Inconsistent" icon={<PenLine size={14} />} />
          </div>

          {/* Mark Details */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.5)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '16px',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '12px', letterSpacing: '0.5px' }}>
              MARK BREAKDOWN
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'Index Mark', value: result.markDetails.indexMark },
                { label: 'End-box Total', value: result.markDetails.endBoxTotal },
                { label: 'Computed Total', value: result.markDetails.computedTotal },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center', flex: 1, minWidth: '80px' }}>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    color: value === null ? '#475569' : '#e2e8f0',
                    fontFamily: 'monospace',
                  }}>
                    {value === null ? '—' : value}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Review Reason */}
          {result.reviewReason && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '10px',
              padding: '14px 16px',
              fontSize: '13px',
              color: '#fbbf24',
              marginBottom: '16px',
              lineHeight: 1.6,
            }}>
              <strong>Review Note:</strong> {result.reviewReason}
            </div>
          )}

          {/* Writer Profile */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(51, 65, 85, 0.4)',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '20px',
            fontSize: '12px',
            color: '#64748b',
          }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>Writer Profile State: </span>
            <span style={{ color: '#6366f1' }}>{result.writerProfile.state || 'NO_PROFILE'}</span>
            {result.writerProfile.state === 'NO_PROFILE' && (
              <span style={{ marginLeft: '8px', color: '#64748b' }}>
                — First submission. No writer profile established yet.
              </span>
            )}
          </div>

          {/* Reset Button */}
          <button
            onClick={() => { setResult(null); setImage1(null); setImage2(null); setError(null); }}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              background: 'rgba(99, 102, 241, 0.08)',
              color: '#6366f1',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <RefreshCw size={16} /> Analyze Different Images
          </button>
        </div>
      )}
    </div>
  );
};

export default OwnershipVerificationPanel;
