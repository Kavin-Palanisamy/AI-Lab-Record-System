from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class FieldConfidence(BaseModel):
    studentName: float = Field(default=0.0, ge=0.0, le=1.0)
    registerNumber: float = Field(default=0.0, ge=0.0, le=1.0)
    experimentNumber: float = Field(default=0.0, ge=0.0, le=1.0)
    experimentTitle: float = Field(default=0.0, ge=0.0, le=1.0)
    date: float = Field(default=0.0, ge=0.0, le=1.0)
    mark: float = Field(default=0.0, ge=0.0, le=1.0)
    maxMark: float = Field(default=0.0, ge=0.0, le=1.0)
    facultySignaturePresent: float = Field(default=0.0, ge=0.0, le=1.0)
    overall: float = Field(default=0.0, ge=0.0, le=1.0)

class ExtractedDocument(BaseModel):
    studentName: Optional[str] = None
    registerNumber: Optional[str] = None
    experimentNumber: Optional[str] = None
    experimentTitle: Optional[str] = None
    date: Optional[str] = None
    mark: Optional[float] = None
    maxMark: Optional[float] = 10.0
    facultySignaturePresent: bool = False
    qrPayload: Optional[str] = None
    qrToken: Optional[str] = None
    rawText: Optional[str] = None
    templateVersion: Optional[str] = "EEE-LAB-TEMPLATE-V1"
    retakeReason: Optional[str] = None
    guidanceTips: List[str] = Field(default_factory=list)

class QualitySignals(BaseModel):
    # Backward compatibility
    imageQuality: str = "GOOD"  # "GOOD", "RETAKE_REQUIRED", "MANUAL_REVIEW"
    documentBoundaryDetected: bool = False
    perspectiveCorrected: bool = False
    qrDetected: bool = False
    markRegionFound: bool = False
    suspicionFlags: List[str] = Field(default_factory=list)
    requiresReview: bool = False

    # Detailed indicators
    blurScore: float = Field(default=1.0, ge=0.0, le=1.0)
    brightness: float = Field(default=0.7, ge=0.0, le=1.0)
    contrast: float = Field(default=0.7, ge=0.0, le=1.0)
    documentCoverage: float = Field(default=1.0, ge=0.0, le=1.0)
    perspectiveSeverity: float = Field(default=0.0, ge=0.0, le=1.0)
    glareEstimate: float = Field(default=0.0, ge=0.0, le=1.0)
    resolution: Dict[str, int] = Field(default_factory=lambda: {"width": 0, "height": 0})
    decision: str = "GOOD"  # "GOOD" | "RETAKE_REQUIRED" | "MANUAL_REVIEW"
    retakeMessage: Optional[str] = None

class BoundingBox(BaseModel):
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    normalized: Optional[Dict[str, float]] = None

class TemplateRegions(BaseModel):
    templateId: str = "EEE-LAB-TEMPLATE-V1"
    studentNameRegion: Optional[BoundingBox] = None
    registerNumberRegion: Optional[BoundingBox] = None
    experimentNumberRegion: Optional[BoundingBox] = None
    experimentTitleRegion: Optional[BoundingBox] = None
    markRegion: Optional[BoundingBox] = None
    signatureRegion: Optional[BoundingBox] = None
    qrRegion: Optional[BoundingBox] = None

class MarkRegionAnalysis(BaseModel):
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    extractedMarks: List[float] = Field(default_factory=list)
    variantLabels: List[str] = Field(default_factory=list)
    isConsistent: bool = True
    discrepancyDelta: float = 0.0
    mark: Optional[float] = None
    confidence: float = 0.90
    handwritingScore: float = 0.85
    consensusMethod: str = "multi_variant_consensus"

class TamperAnalysis(BaseModel):
    suspicionScore: float = Field(default=0.0, ge=0.0, le=1.0)
    signals: List[str] = Field(default_factory=list)
    status: str = "PASS"  # "PASS" | "SUSPICIOUS" | "MANUAL_REVIEW"
    details: Dict[str, Any] = Field(default_factory=dict)

class SignatureAnalysis(BaseModel):
    status: str = "SIGNATURE_PRESENT"  # "SIGNATURE_PRESENT" | "SIGNATURE_NOT_FOUND" | "SIGNATURE_UNCERTAIN"
    confidence: float = Field(default=0.85, ge=0.0, le=1.0)
    strokeDensity: float = 0.0
    providerName: str = "StrokeDensitySignatureProvider"

class LayoutAnalysis(BaseModel):
    isComplete: bool = True
    detectedRegions: List[str] = Field(default_factory=list)
    missingRegions: List[str] = Field(default_factory=list)
    cropWarning: Optional[str] = None
    templateMatched: Optional[str] = "EEE-LAB-TEMPLATE-V1"

class AnalysisResponse(BaseModel):
    success: bool
    document: ExtractedDocument
    confidence: FieldConfidence
    quality: QualitySignals
    markRegion: Optional[MarkRegionAnalysis] = None
    tamperAnalysis: Optional[TamperAnalysis] = None
    signatureAnalysis: Optional[SignatureAnalysis] = None
    layoutAnalysis: Optional[LayoutAnalysis] = None
    templateRegions: Optional[TemplateRegions] = None
    retakeGuidance: List[str] = Field(default_factory=list)
    message: Optional[str] = None
