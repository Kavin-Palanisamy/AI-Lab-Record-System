import {
  LabRecord,
  Experiment,
  AuditLog,
  FacultyDashboardStats,
  User,
  LabSession,
  SessionStats,
  EvaluationReport,
  CaptureChallenge,
  BulkApproveResult,
} from '../types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    ...getAuthHeader(),
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const error: any = new Error(data.message || 'Request failed');
    error.status = response.status;
    error.code = data.code;
    error.details = data.details;
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  async studentLogin(registerNumber: string, password: string): Promise<{ token: string; user: User }> {
    const res: any = await request('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ registerNumber, password }),
    });
    return res.data;
  },

  async facultyLogin(email: string, password: string): Promise<{ token: string; user: User }> {
    const res: any = await request('/auth/faculty/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return res.data;
  },

  // Student Endpoints
  async getStudentProfile(): Promise<User> {
    const res: any = await request('/student/me');
    return res.data;
  },

  async getStudentExperiments(): Promise<Experiment[]> {
    const res: any = await request('/student/experiments');
    return res.data;
  },

  async getStudentRecords(): Promise<LabRecord[]> {
    const res: any = await request('/student/records');
    return res.data;
  },

  async getRecordQrDetails(recordId: string): Promise<{ record: LabRecord; qrPayload: string; qrDataUrl: string }> {
    const res: any = await request(`/student/records/${recordId}/qr`);
    return res.data;
  },

  async submitRecord(
    recordId: string,
    payload: { qrToken?: string; imageFile?: File; challengeId?: string }
  ): Promise<LabRecord> {
    const formData = new FormData();
    if (payload.qrToken) {
      formData.append('qrToken', payload.qrToken);
    }
    if (payload.imageFile) {
      formData.append('image', payload.imageFile);
    }
    if (payload.challengeId) {
      formData.append('challengeId', payload.challengeId);
    }

    const res: any = await request(`/student/records/${recordId}/submit`, {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  // Request Phase 6 Camera Capture Challenge Nonce
  async requestCaptureChallenge(recordId: string): Promise<CaptureChallenge> {
    const res: any = await request(`/student/records/${recordId}/challenge`, {
      method: 'POST',
    });
    return res.data;
  },

  // AI Record Document Intelligence
  async analyzeRecord(imageFile: File): Promise<any> {
    const formData = new FormData();
    formData.append('image', imageFile);

    const res: any = await request('/ai/analyze-record', {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  // Record verification pre-check
  async verifyQr(qrToken: string): Promise<any> {
    const res: any = await request('/records/verify-qr', {
      method: 'POST',
      body: JSON.stringify({ qrToken }),
    });
    return res.data;
  },

  // Faculty Endpoints
  async getFacultyDashboard(): Promise<{
    stats: FacultyDashboardStats;
    records: LabRecord[];
    recentAudits: AuditLog[];
    experiments: Experiment[];
  }> {
    const res: any = await request('/faculty/dashboard');
    return res.data;
  },

  async getFacultyExperiments(): Promise<Experiment[]> {
    const res: any = await request('/faculty/experiments');
    return res.data;
  },

  async getFacultyStudents(): Promise<User[]> {
    const res: any = await request('/faculty/students');
    return res.data;
  },

  async getAllRecords(): Promise<LabRecord[]> {
    const res: any = await request('/faculty/records');
    return res.data;
  },

  async getRecordDetails(id: string): Promise<{ record: LabRecord; auditTrail: AuditLog[] }> {
    const res: any = await request(`/faculty/records/${id}`);
    return res.data;
  },

  async approveRecord(recordId: string, mark: number): Promise<LabRecord> {
    const res: any = await request(`/faculty/records/${recordId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ mark }),
    });
    return res.data;
  },

  async correctRecord(recordId: string, mark: number, reason: string): Promise<LabRecord> {
    const res: any = await request(`/faculty/records/${recordId}/correct`, {
      method: 'POST',
      body: JSON.stringify({ mark, reason }),
    });
    return res.data;
  },

  async rejectRecord(recordId: string, reason?: string): Promise<LabRecord> {
    const res: any = await request(`/faculty/records/${recordId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const res: any = await request('/faculty/audit-logs');
    return res.data;
  },

  // Phase 4: Faculty Session Management & EEE Workflow
  async getLabSessions(): Promise<LabSession[]> {
    const res: any = await request('/faculty/sessions');
    return res.data;
  },

  async createLabSession(data: {
    experimentId: string;
    subject?: string;
    className?: string;
    section?: string;
    maxMark?: number;
    sessionDate?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<LabSession> {
    const res: any = await request('/faculty/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateSessionStatus(sessionId: string, status: string): Promise<LabSession> {
    const res: any = await request(`/faculty/sessions/${sessionId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return res.data;
  },

  async generateRecordsForSession(sessionId: string): Promise<{ createdCount: number; message: string }> {
    const res: any = await request(`/faculty/sessions/${sessionId}/generate-records`, {
      method: 'POST',
    });
    return res.data;
  },

  async awardFacultyMark(recordId: string, mark: number): Promise<LabRecord> {
    const res: any = await request(`/faculty/records/${recordId}/award-mark`, {
      method: 'POST',
      body: JSON.stringify({ mark }),
    });
    return res.data;
  },

  async exportSessionMarksExcel(sessionId: string, sessionCode: string = 'SESSION'): Promise<void> {
    const headers = getAuthHeader();
    const response = await fetch(`${API_BASE}/faculty/sessions/${sessionId}/export-excel`, {
      headers,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(err.message || 'Excel export failed');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EEE_Lab_Marks_${sessionCode}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async downloadSessionSheetsZip(sessionId: string, sessionCode: string = 'SESSION'): Promise<void> {
    const headers = getAuthHeader();
    const response = await fetch(`${API_BASE}/faculty/sessions/${sessionId}/download-sheets`, {
      headers,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(err.message || 'Sheet ZIP download failed');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Record_Sheets_${sessionCode}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async downloadRecordSheet(recordId: string): Promise<void> {
    const headers = getAuthHeader();
    const response = await fetch(`${API_BASE}/faculty/records/${recordId}/sheet`, {
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to load sheet');
    }
    const htmlText = await response.text();
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(htmlText);
      win.document.close();
    }
  },

  async getAllStudents(): Promise<User[]> {
    const res: any = await request('/faculty/students');
    return res.data;
  },

  async getSessionStats(sessionId: string): Promise<SessionStats> {
    const res: any = await request(`/faculty/sessions/${sessionId}/stats`);
    return res.data;
  },

  async getEvaluationMetrics(): Promise<EvaluationReport> {
    const res: any = await request('/faculty/evaluation-metrics');
    return res.data;
  },

  async bulkApproveRecords(recordIds: string[]): Promise<BulkApproveResult> {
    const res: any = await request('/faculty/records/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ recordIds }),
    });
    return res.data;
  },

  async reopenRecord(recordId: string, reason?: string): Promise<LabRecord> {
    const res: any = await request(`/faculty/records/${recordId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  async getFilteredAuditLogs(params: {
    student?: string;
    session?: string;
    event?: string;
    date?: string;
    limit?: number;
  } = {}): Promise<AuditLog[]> {
    const query = new URLSearchParams();
    if (params.student) query.append('student', params.student);
    if (params.session) query.append('session', params.session);
    if (params.event) query.append('event', params.event);
    if (params.date) query.append('date', params.date);
    if (params.limit) query.append('limit', String(params.limit));

    const res: any = await request(`/faculty/audit-logs?${query.toString()}`);
    return res.data;
  },

  // Phase 7: Document Ownership Verification
  async analyzeDocumentOwnership(recordId: string, image1: File, image2: File): Promise<any> {
    const formData = new FormData();
    formData.append('image1', image1);
    formData.append('image2', image2);

    const res: any = await request(`/student/records/${recordId}/ownership-analysis`, {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  async getFacultyOwnershipDetails(recordId: string): Promise<any> {
    const res: any = await request(`/faculty/records/${recordId}/ownership-details`);
    return res.data;
  },

  async facultyApproveOwnership(recordId: string, notes?: string): Promise<any> {
    const res: any = await request(`/faculty/records/${recordId}/ownership-approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
    return res.data;
  },

  async facultyRejectOwnership(recordId: string, reason: string): Promise<any> {
    const res: any = await request(`/faculty/records/${recordId}/ownership-reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  async facultyRequestRetake(recordId: string, reason: string): Promise<any> {
    const res: any = await request(`/faculty/records/${recordId}/ownership-retake`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  // ─── Phase 9 Real-World Redesign: Direct 2-Image Submission by Experiment ───
  async analyzeExperimentSubmission(experimentId: string, image1: File, image2: File): Promise<any> {
    const formData = new FormData();
    formData.append('image1', image1);
    formData.append('image2', image2);

    const res: any = await request(`/student/experiments/${experimentId}/analyze`, {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  async finalizeExperimentSubmission(experimentId: string): Promise<any> {
    const res: any = await request(`/student/experiments/${experimentId}/submit`, {
      method: 'POST',
    });
    return res.data;
  },

  // ─── Phase 9 Real-World Redesign: Faculty Experiment Master & Student Excel ───
  async createExperiment(data: Partial<Experiment>): Promise<Experiment> {
    const res: any = await request('/faculty/experiments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateExperiment(id: string, data: Partial<Experiment>): Promise<Experiment> {
    const res: any = await request(`/faculty/experiments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async importStudentsExcel(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const res: any = await request('/faculty/students/import-excel', {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  async downloadStudentTemplateExcel(): Promise<void> {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/faculty/students/template-excel', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Failed to download template');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SecureLab_Student_Roster_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};

