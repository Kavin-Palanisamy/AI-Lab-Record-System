from typing import Dict, Any, Optional
from ..models.schemas import BoundingBox, TemplateRegions

# Relative coordinates (x, y, width, height) in 0.0 - 1.0 normalized page space
TEMPLATES_REGISTRY: Dict[str, Dict[str, Any]] = {
    "EEE-LAB-TEMPLATE-V1": {
        "templateId": "EEE-LAB-TEMPLATE-V1",
        "name": "Standard EEE Laboratory Continuous Evaluation Record",
        "department": "Department of Electrical and Electronics Engineering",
        "zones": {
            "header": (0.05, 0.02, 0.90, 0.12),
            "student_name": (0.08, 0.16, 0.50, 0.05),
            "register_number": (0.08, 0.22, 0.40, 0.05),
            "experiment_number": (0.08, 0.28, 0.20, 0.05),
            "experiment_title": (0.28, 0.28, 0.65, 0.06),
            "qr_field": (0.65, 0.15, 0.28, 0.22),
            "observation_table": (0.08, 0.38, 0.84, 0.25),
            "faculty_eval": (0.08, 0.66, 0.84, 0.22),
            "mark_field": (0.12, 0.76, 0.35, 0.10),
            "signature_field": (0.55, 0.76, 0.38, 0.10),
        }
    },
    "EEE-TRANS-OCSC-V1": {
        "templateId": "EEE-TRANS-OCSC-V1",
        "name": "Electrical Machines Lab: Transformer OC/SC Test",
        "subject": "Electrical Machines Laboratory",
        "experimentNumber": 1,
        "experimentTitle": "Open Circuit and Short Circuit Test on Single Phase Transformer",
        "maxMark": 10.0,
        "zones": {
            "header": (0.05, 0.02, 0.90, 0.12),
            "student_name": (0.08, 0.16, 0.50, 0.05),
            "register_number": (0.08, 0.22, 0.40, 0.05),
            "experiment_number": (0.08, 0.28, 0.20, 0.05),
            "experiment_title": (0.28, 0.28, 0.65, 0.06),
            "qr_field": (0.65, 0.15, 0.28, 0.22),
            "observation_table": (0.08, 0.38, 0.84, 0.26),  # Voltmeter, Ammeter, Wattmeter columns
            "faculty_eval": (0.08, 0.66, 0.84, 0.22),
            "mark_field": (0.12, 0.76, 0.35, 0.10),
            "signature_field": (0.55, 0.76, 0.38, 0.10),
        }
    },
    "EEE-DIGITAL-LOGIC-V1": {
        "templateId": "EEE-DIGITAL-LOGIC-V1",
        "name": "Digital Electronics Lab: Logic Gates Verification",
        "subject": "Digital Electronics Laboratory",
        "experimentNumber": 2,
        "experimentTitle": "Verification of Logic Gates & Boolean Truth Tables",
        "maxMark": 10.0,
        "zones": {
            "header": (0.05, 0.02, 0.90, 0.12),
            "student_name": (0.08, 0.16, 0.50, 0.05),
            "register_number": (0.08, 0.22, 0.40, 0.05),
            "experiment_number": (0.08, 0.28, 0.20, 0.05),
            "experiment_title": (0.28, 0.28, 0.65, 0.06),
            "qr_field": (0.65, 0.15, 0.28, 0.22),
            "observation_table": (0.08, 0.38, 0.84, 0.26),  # Inputs A, B, Outputs Y
            "faculty_eval": (0.08, 0.66, 0.84, 0.22),
            "mark_field": (0.12, 0.76, 0.35, 0.10),
            "signature_field": (0.55, 0.76, 0.38, 0.10),
        }
    },
    "EEE-RLC-RESONANCE-V1": {
        "templateId": "EEE-RLC-RESONANCE-V1",
        "name": "Electric Circuits Lab: RLC Resonance Measurement",
        "subject": "Electric Circuits Laboratory",
        "experimentNumber": 3,
        "experimentTitle": "Series and Parallel RLC Resonance Frequency Measurement",
        "maxMark": 10.0,
        "zones": {
            "header": (0.05, 0.02, 0.90, 0.12),
            "student_name": (0.08, 0.16, 0.50, 0.05),
            "register_number": (0.08, 0.22, 0.40, 0.05),
            "experiment_number": (0.08, 0.28, 0.20, 0.05),
            "experiment_title": (0.28, 0.28, 0.65, 0.06),
            "qr_field": (0.65, 0.15, 0.28, 0.22),
            "observation_table": (0.08, 0.38, 0.84, 0.26),  # Frequency, Current, Impedance
            "faculty_eval": (0.08, 0.66, 0.84, 0.22),
            "mark_field": (0.12, 0.76, 0.35, 0.10),
            "signature_field": (0.55, 0.76, 0.38, 0.10),
        }
    },
    "EEE-SCR-RECTIFIER-V1": {
        "templateId": "EEE-SCR-RECTIFIER-V1",
        "name": "Power Electronics Lab: SCR Controlled Rectifier",
        "subject": "Power Electronics Laboratory",
        "experimentNumber": 4,
        "experimentTitle": "Single Phase SCR Half-Wave and Full-Wave Controlled Rectifier",
        "maxMark": 10.0,
        "zones": {
            "header": (0.05, 0.02, 0.90, 0.12),
            "student_name": (0.08, 0.16, 0.50, 0.05),
            "register_number": (0.08, 0.22, 0.40, 0.05),
            "experiment_number": (0.08, 0.28, 0.20, 0.05),
            "experiment_title": (0.28, 0.28, 0.65, 0.06),
            "qr_field": (0.65, 0.15, 0.28, 0.22),
            "observation_table": (0.08, 0.38, 0.84, 0.26),  # Firing Angle alpha, Vdc, Idc
            "faculty_eval": (0.08, 0.66, 0.84, 0.22),
            "mark_field": (0.12, 0.76, 0.35, 0.10),
            "signature_field": (0.55, 0.76, 0.38, 0.10),
        }
    },
    "EEE-MCU-8051-V1": {
        "templateId": "EEE-MCU-8051-V1",
        "name": "Microcontroller Lab: 8051 GPIO & Timer Interfacing",
        "subject": "Microcontrollers & Embedded Systems Lab",
        "experimentNumber": 5,
        "experimentTitle": "8051 Microcontroller Port Interfacing and Timer Delay Generation",
        "maxMark": 10.0,
        "zones": {
            "header": (0.05, 0.02, 0.90, 0.12),
            "student_name": (0.08, 0.16, 0.50, 0.05),
            "register_number": (0.08, 0.22, 0.40, 0.05),
            "experiment_number": (0.08, 0.28, 0.20, 0.05),
            "experiment_title": (0.28, 0.28, 0.65, 0.06),
            "qr_field": (0.65, 0.15, 0.28, 0.22),
            "observation_table": (0.08, 0.38, 0.84, 0.26),  # Port, Address, Output state
            "faculty_eval": (0.08, 0.66, 0.84, 0.22),
            "mark_field": (0.12, 0.76, 0.35, 0.10),
            "signature_field": (0.55, 0.76, 0.38, 0.10),
        }
    },
}

class TemplateManager:
    @staticmethod
    def get_template(template_id: str) -> Dict[str, Any]:
        return TEMPLATES_REGISTRY.get(template_id, TEMPLATES_REGISTRY["EEE-LAB-TEMPLATE-V1"])

    @staticmethod
    def match_template(text: str) -> str:
        text_lower = text.lower()
        if "transformer" in text_lower or "open circuit" in text_lower or "short circuit" in text_lower:
            return "EEE-TRANS-OCSC-V1"
        if "logic gate" in text_lower or "boolean" in text_lower or "digital" in text_lower:
            return "EEE-DIGITAL-LOGIC-V1"
        if "resonance" in text_lower or "rlc" in text_lower:
            return "EEE-RLC-RESONANCE-V1"
        if "scr" in text_lower or "rectifier" in text_lower or "firing angle" in text_lower:
            return "EEE-SCR-RECTIFIER-V1"
        if "8051" in text_lower or "microcontroller" in text_lower or "timer" in text_lower:
            return "EEE-MCU-8051-V1"
        return "EEE-LAB-TEMPLATE-V1"

    @staticmethod
    def get_template_regions(template_id: str, width: int, height: int) -> TemplateRegions:
        tmpl = TemplateManager.get_template(template_id)
        zones = tmpl.get("zones", TEMPLATES_REGISTRY["EEE-LAB-TEMPLATE-V1"]["zones"])

        def to_box(zone_key: str) -> BoundingBox:
            rx, ry, rw, rh = zones.get(zone_key, (0, 0, 0, 0))
            px = int(rx * width)
            py = int(ry * height)
            pw = int(rw * width)
            ph = int(rh * height)
            return BoundingBox(
                x=px, y=py, width=pw, height=ph,
                normalized={"x": rx, "y": ry, "width": rw, "height": rh}
            )

        return TemplateRegions(
            templateId=tmpl.get("templateId", "EEE-LAB-TEMPLATE-V1"),
            studentNameRegion=to_box("student_name"),
            registerNumberRegion=to_box("register_number"),
            experimentNumberRegion=to_box("experiment_number"),
            experimentTitleRegion=to_box("experiment_title"),
            markRegion=to_box("mark_field"),
            signatureRegion=to_box("signature_field"),
            qrRegion=to_box("qr_field"),
        )
