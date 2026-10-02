import React from 'react';
import { RecordStatus } from '../types';
import { CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: RecordStatus;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, showIcon = true }) => {
  switch (status) {
    case 'VERIFIED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5" />}
          Verified
        </span>
      );
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {showIcon && <Clock className="w-3.5 h-3.5" />}
          Pending Review
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          {showIcon && <XCircle className="w-3.5 h-3.5" />}
          Rejected
        </span>
      );
    case 'MANUAL_REVIEW':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
          {showIcon && <AlertCircle className="w-3.5 h-3.5" />}
          Manual Review
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
          {status}
        </span>
      );
  }
};
