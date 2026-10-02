import React from 'react';
import { LabRecord } from '../types';
import { X, Printer, Download, ShieldCheck, QrCode } from 'lucide-react';

interface RecordSheetModalProps {
  record: LabRecord | null;
  qrDataUrl: string | null;
  onClose: () => void;
}

export const RecordSheetModal: React.FC<RecordSheetModalProps> = ({ record, qrDataUrl, onClose }) => {
  if (!record) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `QR_${record.uniqueRecordCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white">Official Lab Record Verification Sheet</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Print Sheet"
            >
              <Printer className="w-4 h-4" />
            </button>
            {qrDataUrl && (
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Download QR Image"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Sheet Content */}
        <div className="p-8 bg-white text-slate-900" id="printable-record-sheet">
          <div className="border-4 border-double border-slate-800 p-6 rounded-lg relative">
            {/* Watermark / Seal */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 rounded text-xs font-mono font-semibold text-amber-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              OFFICIAL EEE RECORD
            </div>

            {/* College Header */}
            <div className="text-center pb-4 border-b-2 border-slate-800">
              <h1 className="text-xl font-bold tracking-tight uppercase text-slate-900">
                Department of Electrical and Electronics Engineering
              </h1>
              <h2 className="text-sm font-semibold text-slate-700">
                Continuous Evaluation Laboratory Record Sheet
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Academic Year 2026 – Semester VI • Zero-Trust Verification</p>
            </div>

            {/* Experiment Title */}
            <div className="my-5 text-center bg-slate-50 py-3 rounded-lg border border-slate-200">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                Experiment {record.experiment?.experimentNumber || 1}
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                {record.experiment?.title || 'Open Circuit and Short Circuit Test on Single Phase Transformer'}
              </h3>
              <p className="text-xs text-slate-600 italic">
                Subject: {record.experiment?.subject || record.labSession?.subject || 'Electrical Machines Laboratory'}
              </p>
            </div>

            {/* Details Grid & QR Code */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center my-6">
              {/* Left Student Info */}
              <div className="md:col-span-2 space-y-3 text-sm">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                    Student Name
                  </span>
                  <span className="text-base font-bold text-slate-900">
                    {record.student?.name || 'Authorized Student'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                      Register Number
                    </span>
                    <span className="text-sm font-mono font-bold text-indigo-700">
                      {record.student?.registerNumber || record.detectedStudentRegisterNumber || '048'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                      Class & Section
                    </span>
                    <span className="text-sm font-medium text-slate-800">
                      {record.student?.className || record.labSession?.className || 'III B.E. EEE'} - {record.student?.section || record.labSession?.section || 'A'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                      Session Code
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-800">
                      {record.labSession?.sessionCode || 'EEE-SESS-01'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                      Max Continuous Mark
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {record.maxMark || record.labSession?.maxMark || 10.0} Marks
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                    Unique Record Ownership ID (Cryptographic Token)
                  </span>
                  <span className="text-xs font-mono font-bold bg-slate-100 px-2 py-1 rounded text-slate-800 border border-slate-300 inline-block break-all">
                    {record.uniqueRecordCode}
                  </span>
                </div>
              </div>

              {/* Right QR Code Image */}
              <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Cryptographic Record QR"
                    className="w-44 h-44 object-contain shadow-sm bg-white p-1 rounded-lg"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs">
                    Loading QR...
                  </div>
                )}
                <span className="text-[10px] font-mono text-slate-500 mt-2 text-center">
                  PAYLOAD: LAB_RECORD:{record.qrToken.substring(0, 12)}...
                </span>
                <span className="text-[9px] uppercase tracking-wider font-semibold text-indigo-600 mt-0.5">
                  Scan to submit record
                </span>
              </div>
            </div>

            {/* Continuous Evaluation Rubric & Marks Table */}
            <div className="my-4 pt-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Continuous Evaluation Scheme
              </span>
              <table className="w-full text-xs border border-slate-300 text-left">
                <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold">
                  <tr>
                    <th className="p-2 border-r border-slate-300">Criterion</th>
                    <th className="p-2 border-r border-slate-300 text-center w-24">Max Marks</th>
                    <th className="p-2 text-center w-28">Awarded Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  <tr>
                    <td className="p-2 border-r border-slate-300">1. Pre-Lab / Circuit Design & Connections</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono">3.0</td>
                    <td className="p-2 text-center font-mono"></td>
                  </tr>
                  <tr>
                    <td className="p-2 border-r border-slate-300">2. Conduction & Tabular Observations</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono">4.0</td>
                    <td className="p-2 text-center font-mono"></td>
                  </tr>
                  <tr>
                    <td className="p-2 border-r border-slate-300">3. Calculations, Graphs & Results</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono">2.0</td>
                    <td className="p-2 text-center font-mono"></td>
                  </tr>
                  <tr>
                    <td className="p-2 border-r border-slate-300">4. Viva Voce & Laboratory Discipline</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono">1.0</td>
                    <td className="p-2 text-center font-mono"></td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-2 border-r border-slate-300 text-slate-900">Total Continuous Evaluation Mark</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono text-slate-900">
                      {record.maxMark || 10.0}
                    </td>
                    <td className="p-2 text-center font-mono text-indigo-700 font-bold text-sm">
                      {record.facultyAwardedMark !== null && record.facultyAwardedMark !== undefined
                        ? `${record.facultyAwardedMark}`
                        : record.detectedMark !== null && record.detectedMark !== undefined
                        ? `${record.detectedMark}`
                        : '________'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Faculty Evaluation Footer */}
            <div className="mt-6 pt-4 border-t-2 border-slate-300 grid grid-cols-2 gap-8 text-xs">
              <div className="border border-slate-300 p-3 rounded bg-slate-50">
                <span className="font-bold text-slate-800 block mb-1">FACULTY MARK RECORD</span>
                <p className="text-slate-600">
                  Pre-Awarded Mark:{' '}
                  <strong className="text-slate-900">
                    {record.facultyAwardedMark !== null && record.facultyAwardedMark !== undefined
                      ? `${record.facultyAwardedMark} / ${record.maxMark || 10}`
                      : 'Not Pre-Entered'}
                  </strong>
                </p>
                <p className="text-slate-600 mt-1">
                  Verification Status: <span className="font-mono font-semibold">{record.markVerificationStatus || record.status}</span>
                </p>
              </div>
              <div className="flex flex-col justify-end text-right">
                <div className="h-10 border-b border-dashed border-slate-400 mb-1" />
                <span className="font-bold text-slate-800">Course In-Charge / Faculty Signature</span>
                <span className="text-[10px] text-slate-500">Date & Department Seal</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>Tip: Save or display this QR code to capture it using your camera or upload it directly.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
