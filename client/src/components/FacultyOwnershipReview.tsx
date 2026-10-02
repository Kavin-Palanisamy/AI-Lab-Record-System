/**
 * Phase 7: Faculty Document Ownership Review Panel
 *
 * Shows faculty the full ownership verification evidence for a record.
 * Allows: Approve / Reject / Request Retake
 *
 * Privacy rules enforced server-side:
 *  - This panel may receive prior student ID from audit logs (faculty-only)
 *  - Student-facing UI must NEVER receive this information
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  User,
  FileText,
  RefreshCw,
  Hash,
  Eye,
  BookOpen,
  Clock,
  Search,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditEntry {
  id:         string;
  action:     string;
  actorType:  string;
  actorId:    string;
  metadata:   Record<string, any>;
  createdAt:  string;
}

interface FacultyOwnershipData {
  recordId:      string;
  studentId:     string;
  status:        string;
  reviewReason:  string | null;
  ownershipAudit: AuditEntry[];
}

interface Props {
  recordId:   string;
  recordCode: string;
  studentName?: string;
  onClose?:   () => void;
  onAction?:  () => void;
}

// ─── Signal Chip ──────────────────────────────────────────────────────────────
const Chip: React.FC<{
  label: string;
  value: boolean | null | string;
  good?: string;
  bad?: string;
}> = ({ label, value, good = 'YES', bad = 'NO' }) => {
  const isGood = value === true || value === 'PASS' || value === 'CONSISTENT';
  const isNull = value === null || value === undefined;
  const color  = isNull ? '#94a3b8' : isGood ? '#10b981' : '#ef4444';
  const bg     = isNull ? 'rgba(148,163,184,0.1)' : isGood ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';

  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${color}30`,
      background: bg,
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.5px' }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color }}>
        {isNull ? 'N/A' : value === true ? good : value === false ? bad : String(value)}
      </div>
    </div>
  );
};

// ─── Action Button ────────────────────────────────────────────────────────────
const ActionButton: React.FC<{
  label:    string;
  icon:     React.ReactNode;
  variant:  'approve' | 'reject' | 'retake';
  onClick:  () => void;
  loading:  boolean;
}> = ({ label, icon, variant, onClick, loading }) => {
  const colors: Record<string, { bg: string; border: string; color: string }> = {
    approve: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', color: '#10b981' },
    reject:  { bg: 'rgba(239, 68, 68, 0.12)',  border: 'rgba(239, 68, 68, 0.35)',  color: '#ef4444' },
    retake:  { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', color: '#f59e0b' },
  };
  const c = colors[variant];

  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        flex: 1,
        padding: '12px 16px',
        borderRadius: '10px',
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.color,
        fontSize: '14px',
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        opacity: loading ? 0.6 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      {label}
    </button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const FacultyOwnershipReview: React.FC<Props> = ({
  recordId,
  recordCode,
  studentName,
  onClose,
  onAction,
}) => {
  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState<FacultyOwnershipData | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [notes, setNotes]       = useState('');
  const [acting, setActing]     = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);

  const token = localStorage.getItem('token');

  useEffect(() => { fetchDetails(); }, [recordId]);

  const fetchDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/faculty/records/${recordId}/ownership-details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load');
      setData(json.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const doAction = async (action: 'approve' | 'reject' | 'retake') => {
    setActing(action);
    try {
      const endpoint = {
        approve: 'ownership-approve',
        reject:  'ownership-reject',
        retake:  'ownership-retake',
      }[action];

      const body = action === 'approve'
        ? { notes }
        : { reason: notes };

      const res = await fetch(`/api/faculty/records/${recordId}/${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Action failed');

      setActionDone(action);
      if (onAction) onAction();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  };

  // Extract latest ownership analysis from audit
  const latestAnalysis = data?.ownershipAudit.find(
    (l) => l.action === 'OWNERSHIP_ANALYSIS_COMPLETED'
  );
  const reuseDetected = data?.ownershipAudit.some(
    (l) => l.action === 'DOCUMENT_REUSE_SUSPECTED'
  );
  const writerFlag = data?.ownershipAudit.some(
    (l) => l.action === 'WRITER_INCONSISTENCY'
  );
  const markFlag = data?.ownershipAudit.some(
    (l) => l.action === 'MARK_INCONSISTENCY'
  );

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
        <div>Loading ownership analysis data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '10px',
        padding: '20px',
        color: '#fca5a5',
        textAlign: 'center',
      }}>
        <AlertTriangle size={20} style={{ marginBottom: '8px' }} />
        <div>{error}</div>
        <button onClick={fetchDetails} style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '6px', border: '1px solid #ef4444', background: 'none', color: '#ef4444', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(99, 102, 241, 0.25)',
      borderRadius: '16px',
      padding: '28px',
      maxWidth: '800px',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Search size={20} color="#6366f1" />
            <h2 style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: 700, margin: 0 }}>
              Document Ownership Review
            </h2>
          </div>
          <div style={{ color: '#64748b', fontSize: '13px' }}>
            Record: <span style={{ color: '#6366f1', fontFamily: 'monospace', fontWeight: 600 }}>{recordCode}</span>
            {studentName && (
              <span style={{ marginLeft: '12px' }}>
                Student: <span style={{ color: '#94a3b8' }}>{studentName}</span>
              </span>
            )}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        )}
      </div>

      {/* Evidence Summary Chips */}
      {latestAnalysis && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '12px' }}>
            OWNERSHIP EVIDENCE SUMMARY
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            <Chip label="Experiment"    value={latestAnalysis.metadata?.experimentMatch}      good="Match" bad="Mismatch" />
            <Chip label="Marks"         value={latestAnalysis.metadata?.markConsistent}        good="Consistent" bad="Mismatch" />
            <Chip label="Arithmetic"    value={latestAnalysis.metadata?.arithmeticConsistent}  good="Correct" bad="Error" />
            <Chip label="Writer"        value={latestAnalysis.metadata?.writerConsistent}       good="Consistent" bad="Flag" />
            <Chip label="Exact Reuse"   value={!reuseDetected} good="Clean" bad="DETECTED" />
            <Chip label="Visual Reuse"  value={!latestAnalysis.metadata?.visualReuse} good="Unique" bad="Similar" />
            <Chip label="Writer Flag"   value={!writerFlag} good="OK" bad="Flagged" />
            <Chip label="Mark Flag"     value={!markFlag} good="OK" bad="Flagged" />
          </div>
        </div>
      )}

      {/* Record Status */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.7)',
        border: '1px solid rgba(51, 65, 85, 0.5)',
        borderRadius: '10px',
        padding: '14px 16px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>RECORD STATUS</div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>{data?.status}</div>
        </div>
        {data?.reviewReason && (
          <div style={{ flex: 1, borderLeft: '1px solid rgba(51, 65, 85, 0.6)', paddingLeft: '16px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>REVIEW REASON</div>
            <div style={{ fontSize: '13px', color: '#f59e0b', lineHeight: 1.4 }}>{data.reviewReason}</div>
          </div>
        )}
      </div>

      {/* Audit Log Timeline */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '12px' }}>
          OWNERSHIP AUDIT TRAIL
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {data?.ownershipAudit.map((entry) => (
            <div key={entry.id} style={{
              display: 'flex',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(51, 65, 85, 0.3)',
            }}>
              <div style={{ marginTop: '2px', flexShrink: 0 }}>
                {entry.action.includes('APPROVED')  ? <CheckCircle2 size={14} color="#10b981" /> :
                 entry.action.includes('REJECTED')  ? <XCircle       size={14} color="#ef4444" /> :
                 entry.action.includes('REUSE')     ? <ShieldAlert   size={14} color="#f59e0b" /> :
                 entry.action.includes('WRITER')    ? <FileText      size={14} color="#8b5cf6" /> :
                 entry.action.includes('MARK')      ? <Hash          size={14} color="#f59e0b" /> :
                                                      <Eye           size={14} color="#6366f1" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', fontFamily: 'monospace' }}>
                  {entry.action}
                </div>
                {entry.metadata?.ownershipStatus && (
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Status: {entry.metadata.ownershipStatus} · Risk: {entry.metadata.riskLevel}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#475569', flexShrink: 0, alignSelf: 'center' }}>
                {new Date(entry.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {(!data?.ownershipAudit || data.ownershipAudit.length === 0) && (
            <div style={{ textAlign: 'center', color: '#475569', fontSize: '13px', padding: '20px 0' }}>
              No ownership analysis events logged yet.
            </div>
          )}
        </div>
      </div>

      {/* Notes input */}
      {!actionDone && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '8px' }}>
              FACULTY NOTES (OPTIONAL)
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record observations, reason for decision, physical verification details..."
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                background: 'rgba(15, 23, 42, 0.7)',
                color: '#e2e8f0',
                fontSize: '13px',
                resize: 'vertical',
                minHeight: '80px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <ActionButton
              label="Approve"
              icon={<ThumbsUp size={16} />}
              variant="approve"
              loading={acting === 'approve'}
              onClick={() => doAction('approve')}
            />
            <ActionButton
              label="Reject"
              icon={<ThumbsDown size={16} />}
              variant="reject"
              loading={acting === 'reject'}
              onClick={() => doAction('reject')}
            />
            <ActionButton
              label="Request Retake"
              icon={<RotateCcw size={16} />}
              variant="retake"
              loading={acting === 'retake'}
              onClick={() => doAction('retake')}
            />
          </div>
        </>
      )}

      {/* Action Confirmation */}
      {actionDone && (
        <div style={{
          background: actionDone === 'approve' ? 'rgba(16,185,129,0.1)' : actionDone === 'reject' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
          border: `1px solid ${actionDone === 'approve' ? 'rgba(16,185,129,0.3)' : actionDone === 'reject' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
          borderRadius: '10px',
          padding: '16px',
          textAlign: 'center',
          color: actionDone === 'approve' ? '#10b981' : actionDone === 'reject' ? '#ef4444' : '#f59e0b',
          fontWeight: 700,
        }}>
          {actionDone === 'approve' && '✓ Ownership approved. Audit logged.'}
          {actionDone === 'reject'  && '✕ Submission rejected. Audit logged.'}
          {actionDone === 'retake'  && '↺ Retake requested. Audit logged.'}
        </div>
      )}
    </div>
  );
};

export default FacultyOwnershipReview;
