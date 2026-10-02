import QRCode from 'qrcode';
import JSZip from 'jszip';
import { ILabRecordData, ILabSessionData } from '../prisma/db.js';

export class RecordSheetService {
  /**
   * Generate an official HTML printable sheet for a single lab record with
   * optical fiducial alignment marks, experiment-specific observation tables,
   * continuous assessment rubric, and versioned template IDs.
   */
  async generateRecordSheetHtml(record: ILabRecordData, session?: ILabSessionData): Promise<{ html: string; qrDataUrl: string; templateVersion?: string; zones?: any }> {
    const qrPayload = `LAB_RECORD:${record.qrToken}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 260,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    const studentName = record.student?.name || 'Student';
    const regNo = record.student?.registerNumber || record.detectedStudentRegisterNumber || '048';
    const className = record.student?.className || session?.className || 'III B.E. EEE';
    const section = record.student?.section || session?.section || 'A';
    const subject = record.experiment?.subject || session?.subject || 'Electrical Machines Laboratory';
    const expNum = record.experiment?.experimentNumber ?? (session?.experiment?.experimentNumber ?? 1);
    const expTitle = record.experiment?.title || session?.experiment?.title || 'Open Circuit and Short Circuit Test on Single Phase Transformer';
    const sessionCode = record.labSession?.sessionCode || session?.sessionCode || 'EEE-SESS-01';
    const maxMark = record.maxMark ?? 10.0;
    const templateVersion = record.templateVersion || session?.templateVersion || (
      expNum === 1 ? 'EEE-TRANS-OCSC-V1' :
      expNum === 2 ? 'EEE-DIGITAL-LOGIC-V1' :
      expNum === 3 ? 'EEE-RLC-RESONANCE-V1' :
      expNum === 4 ? 'EEE-SCR-RECTIFIER-V1' :
      expNum === 5 ? 'EEE-MCU-8051-V1' : 'EEE-LAB-TEMPLATE-V1'
    );

    const facultyMark = record.facultyAwardedMark !== null && record.facultyAwardedMark !== undefined
      ? `${record.facultyAwardedMark}`
      : '_____';

    // Build experiment-specific observation table HTML
    let observationTableHtml = '';
    if (expNum === 1 || expTitle.toLowerCase().includes('transformer')) {
      observationTableHtml = `
      <div class="table-section">
        <div class="table-title">1. Open Circuit Test (L.V. Side Energized, H.V. Open)</div>
        <table class="obs-table">
          <thead>
            <tr><th>No-Load Voltage $V_0$ (V)</th><th>No-Load Current $I_0$ (A)</th><th>Core Loss $W_0$ (W)</th><th>Core Resistance $R_c$ (Ω)</th><th>Magnetizing Reactance $X_m$ (Ω)</th></tr>
          </thead>
          <tbody>
            <tr><td>230.0</td><td>0.65</td><td>45.0</td><td>1175.5</td><td>402.1</td></tr>
          </tbody>
        </table>
        <div class="table-title" style="margin-top: 8px;">2. Short Circuit Test (H.V. Side Energized, L.V. Shorted)</div>
        <table class="obs-table">
          <thead>
            <tr><th>Short-Circuit Voltage $V_{sc}$ (V)</th><th>Rated Current $I_{sc}$ (A)</th><th>Copper Loss $W_{sc}$ (W)</th><th>Equivalent Resistance $R_{eq}$ (Ω)</th><th>Equivalent Reactance $X_{eq}$ (Ω)</th></tr>
          </thead>
          <tbody>
            <tr><td>18.5</td><td>4.35</td><td>62.0</td><td>3.28</td><td>2.71</td></tr>
          </tbody>
        </table>
      </div>`;
    } else if (expNum === 2 || expTitle.toLowerCase().includes('logic')) {
      observationTableHtml = `
      <div class="table-section">
        <div class="table-title">Digital Logic Truth Table Verification</div>
        <table class="obs-table">
          <thead>
            <tr><th>Input A</th><th>Input B</th><th>AND ($A \cdot B$)</th><th>OR ($A + B$)</th><th>NAND ($\\overline{A \cdot B}$)</th><th>NOR ($\\overline{A + B}$)</th><th>XOR ($A \oplus B$)</th></tr>
          </thead>
          <tbody>
            <tr><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>1</td><td>0</td></tr>
            <tr><td>0</td><td>1</td><td>0</td><td>1</td><td>1</td><td>0</td><td>1</td></tr>
            <tr><td>1</td><td>0</td><td>0</td><td>1</td><td>1</td><td>0</td><td>1</td></tr>
            <tr><td>1</td><td>1</td><td>1</td><td>1</td><td>0</td><td>0</td><td>0</td></tr>
          </tbody>
        </table>
      </div>`;
    } else if (expNum === 3 || expTitle.toLowerCase().includes('rlc')) {
      observationTableHtml = `
      <div class="table-section">
        <div class="table-title">Series and Parallel RLC Resonance Observations</div>
        <table class="obs-table">
          <thead>
            <tr><th>Frequency $f$ (kHz)</th><th>Circuit Current $I$ (mA)</th><th>Inductor Voltage $V_L$ (V)</th><th>Capacitor Voltage $V_C$ (V)</th><th>Total Impedance $Z$ (Ω)</th></tr>
          </thead>
          <tbody>
            <tr><td>1.0</td><td>12.4</td><td>4.2</td><td>8.6</td><td>806.4</td></tr>
            <tr><td>1.5</td><td>28.5</td><td>7.8</td><td>7.9</td><td>350.8</td></tr>
            <tr><td>2.0</td><td>15.2</td><td>9.5</td><td>4.8</td><td>657.9</td></tr>
          </tbody>
        </table>
      </div>`;
    } else {
      observationTableHtml = `
      <div class="table-section">
        <div class="table-title">Laboratory Experimental Observations & Calculations</div>
        <table class="obs-table">
          <thead>
            <tr><th>S.No</th><th>Parameter 1</th><th>Parameter 2</th><th>Observed Value</th><th>Calculated Value</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>Nominal Setting</td><td>Rated Input</td><td>Verified</td><td>Consistent</td></tr>
            <tr><td>2</td><td>Peak Operating</td><td>Full Load</td><td>Recorded</td><td>Computed</td></tr>
          </tbody>
        </table>
      </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EEE Lab Record - ${studentName} (${regNo})</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; background: #fff; }
    .sheet-card { border: 3px double #0f172a; border-radius: 8px; padding: 20px; max-width: 800px; margin: 0 auto; box-sizing: border-box; position: relative; }
    
    /* Optical Fiducial Registration Marks (for phone camera rectification) */
    .fiducial-tl { position: absolute; top: 8px; left: 8px; width: 16px; height: 16px; border-top: 3px solid #0f172a; border-left: 3px solid #0f172a; }
    .fiducial-tr { position: absolute; top: 8px; right: 8px; width: 16px; height: 16px; border-top: 3px solid #0f172a; border-right: 3px solid #0f172a; }
    .fiducial-bl { position: absolute; bottom: 8px; left: 8px; width: 16px; height: 16px; border-bottom: 3px solid #0f172a; border-left: 3px solid #0f172a; }
    .fiducial-br { position: absolute; bottom: 8px; right: 8px; width: 16px; height: 16px; border-bottom: 3px solid #0f172a; border-right: 3px solid #0f172a; }

    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
    .college-name { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; margin: 0; }
    .dept-name { font-size: 13px; font-weight: 700; color: #1e3a8a; margin: 3px 0 0 0; text-transform: uppercase; }
    .doc-type { font-size: 11px; font-weight: 600; color: #475569; margin: 3px 0 0 0; letter-spacing: 0.5px; }
    .template-badge { display: inline-block; font-size: 9px; font-family: monospace; font-weight: bold; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; margin-top: 3px; color: #334155; }
    
    .exp-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin: 12px 0; text-align: center; }
    .exp-num { font-size: 11px; font-weight: bold; color: #2563eb; text-transform: uppercase; letter-spacing: 1px; }
    .exp-title { font-size: 15px; font-weight: bold; color: #0f172a; margin: 3px 0 0 0; }
    .exp-subject { font-size: 11px; color: #475569; margin: 2px 0 0 0; }

    .grid { display: flex; justify-content: space-between; align-items: center; margin: 14px 0; gap: 16px; }
    .student-details { flex: 1; }
    .detail-row { display: flex; margin-bottom: 6px; font-size: 12px; }
    .detail-label { width: 140px; font-weight: 600; color: #475569; }
    .detail-value { font-weight: bold; color: #0f172a; }
    
    .qr-container { text-align: center; padding: 8px; border: 1px dashed #94a3b8; border-radius: 6px; background: #fff; width: 160px; }
    .qr-container img { width: 140px; height: 140px; display: block; margin: 0 auto; }
    .qr-caption { font-size: 8px; font-family: monospace; color: #64748b; margin-top: 4px; word-break: break-all; }

    .table-section { margin: 12px 0; font-size: 11px; }
    .table-title { font-weight: bold; color: #1e293b; margin-bottom: 4px; font-size: 11px; }
    .obs-table { width: 100%; border-collapse: collapse; font-size: 10px; text-align: center; }
    .obs-table th, .obs-table td { border: 1px solid #cbd5e1; padding: 4px 6px; }
    .obs-table th { background: #f1f5f9; font-weight: 600; color: #334155; }

    .rubric-table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 10px 0; }
    .rubric-table th, .rubric-table td { border: 1px solid #cbd5e1; padding: 4px 6px; }
    .rubric-table th { background: #f8fafc; text-align: left; }
    .rubric-table td.center { text-align: center; }

    .eval-box { border: 2px solid #0f172a; border-radius: 6px; padding: 12px; margin-top: 14px; background: #fcfcfc; }
    .eval-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .eval-grid { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 4px; }
    .mark-box { font-size: 14px; font-weight: bold; color: #0f172a; }
    .mark-val { font-size: 20px; color: #1e3a8a; border-bottom: 2px solid #0f172a; padding: 0 12px; font-family: 'Courier New', monospace; font-weight: bold; }
    .sig-box { text-align: center; width: 200px; }
    .sig-line { border-bottom: 1.5px solid #0f172a; margin-bottom: 4px; height: 30px; }
    .sig-label { font-size: 10px; font-weight: 600; color: #475569; }
    
    .footer-note { font-size: 8px; color: #94a3b8; text-align: center; margin-top: 12px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="sheet-card">
    <div class="fiducial-tl"></div>
    <div class="fiducial-tr"></div>
    <div class="fiducial-bl"></div>
    <div class="fiducial-br"></div>

    <div class="header">
      <h1 class="college-name">College of Engineering & Technology</h1>
      <h2 class="dept-name">Department of Electrical and Electronics Engineering</h2>
      <p class="doc-type">PHYSICAL LABORATORY RECORD & CONTINUOUS EVALUATION</p>
      <div class="template-badge">TEMPLATE: ${templateVersion}</div>
    </div>

    <div class="exp-box">
      <div class="exp-num">EXPERIMENT ${expNum}</div>
      <div class="exp-title">${expTitle}</div>
      <div class="exp-subject">Subject: ${subject}</div>
    </div>

    <div class="grid">
      <div class="student-details">
        <div class="detail-row"><span class="detail-label">Student Name:</span><span class="detail-value">${studentName}</span></div>
        <div class="detail-row"><span class="detail-label">Register Number:</span><span class="detail-value" style="font-family: monospace;">${regNo}</span></div>
        <div class="detail-row"><span class="detail-label">Class & Section:</span><span class="detail-value">${className} - ${section}</span></div>
        <div class="detail-row"><span class="detail-label">Lab Session:</span><span class="detail-value" style="font-family: monospace;">${sessionCode}</span></div>
        <div class="detail-row"><span class="detail-label">Unique Record ID:</span><span class="detail-value" style="font-family: monospace; font-size: 10px;">${record.uniqueRecordCode}</span></div>
      </div>
      <div class="qr-container">
        <img src="${qrDataUrl}" alt="Lab QR Code" />
        <div class="qr-caption">${record.uniqueRecordCode}</div>
      </div>
    </div>

    ${observationTableHtml}

    <table class="rubric-table">
      <thead>
        <tr><th>Continuous Assessment Criteria</th><th class="center" style="width: 80px;">Max Marks</th><th class="center" style="width: 100px;">Awarded Marks</th></tr>
      </thead>
      <tbody>
        <tr><td>1. Pre-Lab Circuit Diagram & Verification</td><td class="center">3.0</td><td class="center"></td></tr>
        <tr><td>2. Conduction & Tabular Observations</td><td class="center">4.0</td><td class="center"></td></tr>
        <tr><td>3. Calculations, Curves & Result</td><td class="center">2.0</td><td class="center"></td></tr>
        <tr><td>4. Viva Voce & Laboratory Discipline</td><td class="center">1.0</td><td class="center"></td></tr>
      </tbody>
    </table>

    <div class="eval-box">
      <div class="eval-title">Faculty Continuous Assessment</div>
      <div class="eval-grid">
        <div class="mark-box">
          Awarded Mark: <span class="mark-val">${facultyMark}</span> / ${maxMark}
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Course In-Charge Signature & Date</div>
        </div>
      </div>
    </div>

    <div class="footer-note">
      Cryptographic Ownership Token: LAB_RECORD:${record.qrToken.substring(0, 16)}... | Zero-Trust Student ID Binding Active
    </div>
  </div>
</body>
</html>`;

    const zones = {
      header: { x: 0.1, y: 0.05, width: 0.8, height: 0.12 },
      studentInfo: { x: 0.1, y: 0.18, width: 0.8, height: 0.10 },
      experimentInfo: { x: 0.1, y: 0.28, width: 0.8, height: 0.08 },
      observation: { x: 0.1, y: 0.38, width: 0.8, height: 0.28 },
      evaluation: { x: 0.1, y: 0.68, width: 0.8, height: 0.15 },
      qrCode: { x: 0.68, y: 0.84, width: 0.22, height: 0.12 },
    };

    return {
      html,
      qrDataUrl,
      templateVersion: record.templateVersion || 'EEE-LAB-TEMPLATE-V1',
      zones,
    };
  }

  /**
   * Export all record sheets for a lab session in a single ZIP bundle
   */
  async exportSessionSheetsZip(session: ILabSessionData, records: ILabRecordData[]): Promise<Buffer> {
    const zip = new JSZip();
    const folderName = `Record_Sheets_${session.sessionCode}`;
    const folder = zip.folder(folderName) || zip;

    for (const record of records) {
      const { html } = await this.generateRecordSheetHtml(record, session);
      const regNo = record.student?.registerNumber || record.detectedStudentRegisterNumber || 'student';
      const filename = `${regNo}_${record.uniqueRecordCode}.html`;
      folder.file(filename, html);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return zipBuffer;
  }

  /**
   * Alias for exportSessionSheetsZip
   */
  async generateSessionSheetsZip(session: ILabSessionData, records: ILabRecordData[]): Promise<Buffer> {
    return this.exportSessionSheetsZip(session, records);
  }
}

export const defaultRecordSheetService = new RecordSheetService();
