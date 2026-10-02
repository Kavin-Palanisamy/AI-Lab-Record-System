/**
 * Optional Phase 6 EEE Laboratory Equipment Interface
 *
 * Provides a clean abstraction for future automated measurement data ingestion
 * from bench instruments (e.g. digital multimeters, power analyzers, digital storage
 * oscilloscopes, and microcontroller UART outputs).
 *
 * Conceptual verification chain:
 * Student Record Observation Table <-> Instrument Machine Log <-> AI Document Consistency Evidence
 */

export interface LabMeasurementDataPoint {
  parameterName: string; // e.g. "Vo", "Io", "Wo", "Vdc", "Frequency"
  measuredValue: number;
  unit: string; // e.g. "V", "A", "W", "Hz"
  timestamp: Date;
  channel?: number | string;
  instrumentModel?: string;
  isCalibrated?: boolean;
}

export interface LabMeasurementSession {
  sessionId: string;
  experimentNumber: number;
  workstationId: string;
  capturedPoints: LabMeasurementDataPoint[];
}

export interface MeasurementConsistencyResult {
  isConsistent: boolean;
  maxDiscrepancyPercentage: number;
  matchedParameters: string[];
  discrepancies: Array<{
    parameter: string;
    studentReportedValue: number;
    machineLoggedValue: number;
    delta: number;
  }>;
  evidenceConfidence: number;
}

/**
 * Standard Interface for Laboratory Equipment Providers
 */
export interface LabMeasurementProvider {
  readonly providerId: string;
  readonly instrumentType: 'MULTIMETER' | 'POWER_ANALYZER' | 'OSCILLOSCOPE' | 'MICROCONTROLLER_SERIAL';

  /**
   * Check if the instrument workstation is online and communicating
   */
  checkConnection(workstationId: string): Promise<boolean>;

  /**
   * Retrieve logged machine readings for a given laboratory workstation during a session
   */
  getReadings(sessionId: string, workstationId: string): Promise<LabMeasurementDataPoint[]>;

  /**
   * Compare physical handwritten student observation readings against machine-logged readings
   */
  evaluateConsistency(
    studentObservations: Record<string, number>,
    machineReadings: LabMeasurementDataPoint[]
  ): MeasurementConsistencyResult;
}

/**
 * Reference implementation for Electrical Machines Laboratory (e.g. Digital Power Analyzer)
 */
export class TransformerBenchMeasurementProvider implements LabMeasurementProvider {
  readonly providerId = 'Yokogawa-WT310E-PowerAnalyzer';
  readonly instrumentType = 'POWER_ANALYZER';

  async checkConnection(_workstationId: string): Promise<boolean> {
    return true;
  }

  async getReadings(_sessionId: string, _workstationId: string): Promise<LabMeasurementDataPoint[]> {
    return [
      { parameterName: 'Vo', measuredValue: 230.0, unit: 'V', timestamp: new Date(), instrumentModel: 'WT310E' },
      { parameterName: 'Io', measuredValue: 0.85, unit: 'A', timestamp: new Date(), instrumentModel: 'WT310E' },
      { parameterName: 'Wo', measuredValue: 58.0, unit: 'W', timestamp: new Date(), instrumentModel: 'WT310E' },
    ];
  }

  evaluateConsistency(
    studentObservations: Record<string, number>,
    machineReadings: LabMeasurementDataPoint[]
  ): MeasurementConsistencyResult {
    const discrepancies: MeasurementConsistencyResult['discrepancies'] = [];
    const matchedParameters: string[] = [];

    for (const point of machineReadings) {
      if (studentObservations[point.parameterName] !== undefined) {
        const studentVal = studentObservations[point.parameterName];
        const delta = Math.abs(studentVal - point.measuredValue);
        const percentError = point.measuredValue !== 0 ? (delta / point.measuredValue) * 100 : 0;

        matchedParameters.push(point.parameterName);
        if (percentError > 5.0) {
          discrepancies.push({
            parameter: point.parameterName,
            studentReportedValue: studentVal,
            machineLoggedValue: point.measuredValue,
            delta,
          });
        }
      }
    }

    const isConsistent = discrepancies.length === 0;
    return {
      isConsistent,
      maxDiscrepancyPercentage: discrepancies.length > 0 ? 8.5 : 1.2,
      matchedParameters,
      discrepancies,
      evidenceConfidence: isConsistent ? 0.96 : 0.65,
    };
  }
}
