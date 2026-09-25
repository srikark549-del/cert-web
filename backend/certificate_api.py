import csv
import hashlib
import hmac
import io
import json
import mimetypes
import os
import secrets
import smtplib
import time
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file
from werkzeug.utils import secure_filename

try:
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
except ImportError:
    PdfReader = PdfWriter = canvas = ImageReader = None

try:
    from . import db
except ImportError:
    import db


certificate_api = Blueprint("certificate_api", __name__, url_prefix="/api/v1")
ROOT = Path(__file__).resolve().parent.parent


def _now():
    return datetime.now(timezone.utc).isoformat()


def _default_state():
    return {
        "imports": [], "participants": [], "templates": [], "certificates": [],
        "emailJobs": [], "auditLogs": [], "settings": {
            "eventName": "", "organizationName": "", "certificateIdPrefix": "CERT",
            "issueDate": "", "activeTemplateId": "", "requireCheckIn": True,
            "requireCheckOut": True, "senderName": "", "replyToAddress": "",
            "emailSubject": "Your certificate", "emailBodyTemplate": "",
        },
    }


def _load_state():
    try:
        saved = db.load_state()
    except Exception as exc:
        raise RuntimeError(f"Certificate portal data cannot be read: {exc}") from exc
    if saved is None:
        return _default_state()
    state = _default_state()
    state.update(saved)
    state["settings"] = {**_default_state()["settings"], **saved.get("settings", {})}
    return state


portal_state = _load_state()


def _save_state():
    db.save_state(portal_state)


def _response(data=None, message=None, status=200):
    payload = {"success": True, "data": data}
    if message:
        payload["message"] = message
    return jsonify(payload), status


def _error(code, message, status=400, details=None):
    return jsonify(success=False, error={"code": code, "message": message, "details": details or {}},
                   requestId=uuid.uuid4().hex), status


def _token(user):
    body = json.dumps({"sub": user["id"], "role": user["role"], "exp": int(time.time()) + 86400},
                      separators=(",", ":")).encode().hex()
    sig = hmac.new(os.getenv("JWT_SECRET", "certificate-portal-local-secret").encode(),
                   body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _current_admin():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        body, sig = header[7:].split(".", 1)
        expected = hmac.new(os.getenv("JWT_SECRET", "certificate-portal-local-secret").encode(),
                            body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(bytes.fromhex(body))
        return payload if payload["exp"] >= int(time.time()) and payload["role"] == "ADMIN" else None
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def _require_admin():
    return _current_admin() is not None


def _audit(action, record, status="SUCCESS", details=""):
    portal_state["auditLogs"].insert(0, {
        "id": f"aud_{uuid.uuid4().hex[:10]}", "action": action,
        "admin": os.getenv("ADMIN_EMAIL", "administrator"), "record": record,
        "date": _now(), "status": status, "details": details,
    })
    _save_state()


def _normalize_key(value):
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


def _extract_pdf_rows(raw):
    if PdfReader is None:
        raise ValueError("PDF processing is unavailable. Install the backend PDF dependencies.")
    reader = PdfReader(io.BytesIO(raw))
    lines = []
    for page in reader.pages:
        lines.extend((page.extract_text() or "").splitlines())
    rows = []
    for line in lines:
        values = [part.strip() for part in line.split("|")]
        if len(values) > 1:
            rows.append(values)
    if not rows:
        return [], []
    headers = rows[0]
    return headers, [dict(zip(headers, row)) for row in rows[1:]]


def _parse_upload(file_storage):
    filename = secure_filename(file_storage.filename or "")
    extension = Path(filename).suffix.lower()
    raw = file_storage.read()
    if extension == ".csv":
        text = raw.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        return list(reader.fieldnames or []), [dict(row) for row in reader], "CSV", raw
    if extension == ".pdf":
        headers, rows = _extract_pdf_rows(raw)
        return headers, rows, "PDF", raw
    raise ValueError("Only CSV and PDF attendance files are supported.")


def _mapping_value(row, mapping, key):
    column = mapping.get(key)
    return str(row.get(column, "")).strip() if column else ""


def _participant_from_row(row, mapping, index):
    aliases = {
        "name": ("name", "studentname", "fullname", "participantname"),
        "email": ("email", "mailid", "emailaddress"),
        "studentId": ("studentid", "id", "studentnumber"),
        "rollNumber": ("rollnumber", "rollno", "rollno"),
        "checkIn": ("checkin", "checkintime", "entry", "entrytime"),
        "checkOut": ("checkout", "checkouttime", "exit", "exittime"),
    }
    normalized = {_normalize_key(k): str(v or "").strip() for k, v in row.items()}

    def value(key):
        mapped = _mapping_value(row, mapping, key)
        if mapped:
            return mapped
        for alias in aliases[key]:
            if normalized.get(alias):
                return normalized[alias]
        return ""

    name, email = value("name"), value("email")
    student_id, roll = value("studentId"), value("rollNumber")
    check_in, check_out = value("checkIn"), value("checkOut")
    errors = []
    if not name:
        errors.append("MISSING_NAME")
    if not email or "@" not in email:
        errors.append("INVALID_EMAIL")
    if not student_id:
        errors.append("MISSING_STUDENT_ID")
    if not roll:
        errors.append("MISSING_ROLL_NUMBER")
    if not check_in:
        errors.append("MISSING_CHECK_IN")
    if not check_out:
        errors.append("MISSING_CHECK_OUT")
    eligible = bool(check_in and check_out and not any(e in errors for e in ("MISSING_NAME", "INVALID_EMAIL")))
    return {
        "id": f"part_{uuid.uuid4().hex[:12]}", "name": name, "email": email,
        "studentId": student_id, "rollNumber": roll, "checkIn": check_in or None,
        "checkOut": check_out or None, "eligibility": "ELIGIBLE" if eligible else "NOT_ELIGIBLE",
        "eligibilityReason": "Check-in and check-out verified" if eligible else ", ".join(errors),
        "certificateStatus": "PENDING", "validationErrors": errors, "sourceRow": index + 2,
    }


def _paginate(items):
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 25)), 1), 100)
    total = len(items)
    start = (page - 1) * limit
    return {"items": items[start:start + limit], "pagination": {
        "page": page, "limit": limit, "total": total,
        "totalPages": (total + limit - 1) // limit if total else 0,
    }}


@certificate_api.post("/auth/login")
def portal_login():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    configured_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    configured_password = os.getenv("ADMIN_PASSWORD", "")
    if not configured_email or not configured_password or not hmac.compare_digest(email, configured_email) or not hmac.compare_digest(password, configured_password):
        return _error("INVALID_CREDENTIALS", "Invalid administrator credentials.", 401)
    user = {"id": "admin", "name": os.getenv("ADMIN_FULL_NAME", "Administrator"),
            "email": configured_email, "role": "ADMIN", "lastLogin": _now()}
    return _response({"accessToken": _token(user), "expiresAt": datetime.fromtimestamp(int(time.time()) + 86400, timezone.utc).isoformat(), "user": user})


@certificate_api.get("/auth/me")
def portal_me():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    return _response({"id": "admin", "name": os.getenv("ADMIN_FULL_NAME", "Administrator"),
                      "email": os.getenv("ADMIN_EMAIL", ""), "role": "ADMIN", "lastLogin": _now()})


@certificate_api.post("/auth/logout")
def portal_logout():
    return _response(None, "Logged out successfully")


@certificate_api.post("/imports")
def create_import():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    uploaded = request.files.get("file")
    if not uploaded:
        return _error("FILE_REQUIRED", "Attendance file is required.", 422)
    try:
        columns, rows, file_type, raw = _parse_upload(uploaded)
    except ValueError as exc:
        return _error("INVALID_FILE", str(exc), 422)
    import_id = f"imp_{uuid.uuid4().hex[:12]}"
    db.save_file(f"import:{import_id}", secure_filename(uploaded.filename), raw)
    job = {"id": import_id, "filename": uploaded.filename, "fileType": file_type,
           "fileSize": str(len(raw)), "uploadedAt": _now(), "status": "UPLOADED",
           "columns": columns, "rawRows": rows, "mapping": {}, "records": [],
           "totalRecords": len(rows), "validRecords": 0, "invalidRecords": 0,
           "duplicateRecords": 0, "missingNames": 0, "missingEmails": 0,
           "missingIds": 0, "missingRollNumbers": 0, "missingCheckIn": 0, "missingCheckOut": 0}
    portal_state["imports"].append(job)
    _save_state()
    _audit("FILE_UPLOADED", uploaded.filename)
    return _response({"importId": import_id, "filename": uploaded.filename, "fileType": file_type, "status": "UPLOADED"}, status=201)


def _find_import(import_id):
    return next((item for item in portal_state["imports"] if item["id"] == import_id), None)


@certificate_api.get("/imports/<import_id>")
def import_status(import_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = _find_import(import_id)
    if not job:
        return _error("NOT_FOUND", "Import job not found.", 404)
    return _response({key: value for key, value in job.items() if key not in ("rawRows", "mapping")})


@certificate_api.get("/imports/<import_id>/preview")
def import_preview(import_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = _find_import(import_id)
    if not job:
        return _error("NOT_FOUND", "Import job not found.", 404)
    return _response({"columns": job["columns"], "records": job["rawRows"]})


@certificate_api.post("/imports/<import_id>/mapping")
def import_mapping(import_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = _find_import(import_id)
    if not job:
        return _error("NOT_FOUND", "Import job not found.", 404)
    job["mapping"] = request.get_json(silent=True).get("mapping", {}) if request.is_json else {}
    job["status"] = "PROCESSING"
    _save_state()
    return _response({"importId": import_id, "status": job["status"], "mapping": job["mapping"]})


@certificate_api.post("/imports/<import_id>/validate")
def validate_import(import_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = _find_import(import_id)
    if not job:
        return _error("NOT_FOUND", "Import job not found.", 404)
    body = request.get_json(silent=True) or {}
    if body.get("mapping"):
        job["mapping"] = body["mapping"]
    records = [_participant_from_row(row, job["mapping"], index) for index, row in enumerate(job["rawRows"])]
    seen = set()
    duplicates = 0
    for record in records:
        identity = (record["email"].lower(), record["rollNumber"].lower())
        if identity in seen:
            duplicates += 1
            record["validationErrors"].append("DUPLICATE_RECORD")
            record["eligibility"] = "NOT_ELIGIBLE"
        seen.add(identity)
    job["records"] = records
    job["status"] = "VALIDATED"
    job["validRecords"] = sum(not r["validationErrors"] for r in records)
    job["invalidRecords"] = len(records) - job["validRecords"]
    job["duplicateRecords"] = duplicates
    job["missingNames"] = sum("MISSING_NAME" in r["validationErrors"] for r in records)
    job["missingEmails"] = sum("INVALID_EMAIL" in r["validationErrors"] for r in records)
    job["missingIds"] = sum("MISSING_STUDENT_ID" in r["validationErrors"] for r in records)
    job["missingRollNumbers"] = sum("MISSING_ROLL_NUMBER" in r["validationErrors"] for r in records)
    job["missingCheckIn"] = sum("MISSING_CHECK_IN" in r["validationErrors"] for r in records)
    job["missingCheckOut"] = sum("MISSING_CHECK_OUT" in r["validationErrors"] for r in records)
    _save_state()
    _audit("FILE_PROCESSED", job["filename"])
    errors = [{"row": r["sourceRow"], "codes": r["validationErrors"]} for r in records if r["validationErrors"]]
    return _response({"status": "VALIDATED", "totalRecords": len(records), "validRecords": job["validRecords"],
                      "invalidRecords": job["invalidRecords"], "duplicateRecords": duplicates,
                      "eligibleRecords": sum(r["eligibility"] == "ELIGIBLE" for r in records),
                      "ineligibleRecords": sum(r["eligibility"] != "ELIGIBLE" for r in records), "errors": errors})


@certificate_api.post("/imports/<import_id>/confirm")
def confirm_import(import_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = _find_import(import_id)
    if not job or job["status"] != "VALIDATED":
        return _error("INVALID_STATE", "Import must be validated before confirmation.", 422)
    body = request.get_json(silent=True) or {}
    records = job["records"] if not body.get("importValidRecordsOnly", True) else [r for r in job["records"] if not r["validationErrors"]]
    existing = {p["id"] for p in portal_state["participants"]}
    records = [r for r in records if r["id"] not in existing]
    portal_state["participants"].extend(records)
    prefix = portal_state["settings"].get("certificateIdPrefix") or "CERT"
    active_template = portal_state["settings"].get("activeTemplateId")
    created = []
    for index, participant in enumerate(records, 1):
        if participant["eligibility"] != "ELIGIBLE":
            continue
        certificate_id = f"{prefix}-{len(portal_state['certificates']) + index:05d}"
        created.append({"id": f"cert_{uuid.uuid4().hex[:12]}", "certificateId": certificate_id,
                        "participantId": participant["id"], "participantName": participant["name"],
                        "participantEmail": participant["email"], "participantRollNumber": participant["rollNumber"],
                        "participantStudentId": participant["studentId"], "checkIn": participant["checkIn"],
                        "checkOut": participant["checkOut"], "templateId": active_template or "",
                        "templateName": "", "status": "PENDING", "eventName": portal_state["settings"]["eventName"],
                        "issueDate": portal_state["settings"]["issueDate"] or _now()[:10]})
    portal_state["certificates"].extend(created)
    job["status"] = "IMPORTED"
    _save_state()
    return _response({"importId": import_id, "status": "IMPORTED", "participantsCreated": len(records),
                      "certificateRequestsCreated": len(created)})


@certificate_api.get("/participants")
def participants():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    items = list(portal_state["participants"])
    search = request.args.get("search", "").strip().lower()
    if search:
        items = [p for p in items if search in json.dumps(p).lower()]
    if request.args.get("eligibility") and request.args["eligibility"] != "ALL":
        items = [p for p in items if p["eligibility"] == request.args["eligibility"]]
    if request.args.get("certificateStatus") and request.args["certificateStatus"] != "ALL":
        items = [p for p in items if p.get("certificateStatus") == request.args["certificateStatus"]]
    return _response(_paginate(items))


@certificate_api.get("/participants/<participant_id>")
def participant_detail(participant_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = next((p for p in portal_state["participants"] if p["id"] == participant_id), None)
    return _response(item) if item else _error("NOT_FOUND", "Participant not found.", 404)


@certificate_api.get("/templates")
def templates():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    return _response(portal_state["templates"])


@certificate_api.get("/templates/<template_id>")
def template_detail(template_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    template = next((item for item in portal_state["templates"] if item["id"] == template_id), None)
    if not template:
        return _error("NOT_FOUND", "Template not found.", 404)
    return _response(template)


@certificate_api.post("/templates")
def create_template():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    uploaded = request.files.get("file")
    if not uploaded:
        return _error("FILE_REQUIRED", "Certificate template file is required.", 422)
    extension = Path(uploaded.filename or "").suffix.lower().lstrip(".")
    if extension not in ("pdf", "png", "jpg", "jpeg"):
        return _error("INVALID_FILE", "Only PDF, PNG, JPG, and JPEG templates are supported.", 422)
    template_id = f"tpl_{uuid.uuid4().hex[:12]}"
    filename = f"{template_id}.{extension}"
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    db.save_file(f"template:{template_id}", filename, uploaded.read(), content_type)
    item = {"id": template_id, "name": request.form.get("name") or uploaded.filename,
            "fileType": extension.upper(), "filePath": filename, "previewUrl": f"/api/v1/templates/{template_id}/file",
            "active": not portal_state["templates"], "uploadedAt": _now(), "usageCount": 0, "fields": []}
    portal_state["templates"].append(item)
    if item["active"]:
        portal_state["settings"]["activeTemplateId"] = template_id
    _save_state()
    _audit("TEMPLATE_UPLOADED", item["name"])
    return _response({key: value for key, value in item.items() if key != "filePath"}, status=201)


@certificate_api.get("/templates/<template_id>/file")
def template_file(template_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = next((t for t in portal_state["templates"] if t["id"] == template_id), None)
    if not item:
        return _error("NOT_FOUND", "Template not found.", 404)
    stored = db.load_file(f"template:{template_id}")
    if not stored:
        return _error("NOT_FOUND", "Template file not found.", 404)
    return send_file(io.BytesIO(stored["data"]), download_name=item["name"],
                     mimetype=stored.get("content_type") or "application/octet-stream")


@certificate_api.post("/templates/<template_id>/activate")
def activate_template(template_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = next((t for t in portal_state["templates"] if t["id"] == template_id), None)
    if not item:
        return _error("NOT_FOUND", "Template not found.", 404)
    for template in portal_state["templates"]:
        template["active"] = template["id"] == template_id
    portal_state["settings"]["activeTemplateId"] = template_id
    _save_state()
    return _response({"templateId": template_id, "active": True})


@certificate_api.put("/templates/<template_id>/fields")
def update_template_fields(template_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = next((t for t in portal_state["templates"] if t["id"] == template_id), None)
    if not item:
        return _error("NOT_FOUND", "Template not found.", 404)
    fields = (request.get_json(silent=True) or {}).get("fields")
    if not isinstance(fields, list):
        return _error("INVALID_FIELDS", "Fields must be an array.", 422)
    item["fields"] = fields
    _save_state()
    _audit("TEMPLATE_UPDATED", item["name"])
    return _response(item)


@certificate_api.delete("/templates/<template_id>")
def delete_template(template_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = next((t for t in portal_state["templates"] if t["id"] == template_id), None)
    if not item:
        return _error("NOT_FOUND", "Template not found.", 404)
    portal_state["templates"].remove(item)
    _save_state()
    db.delete_file(f"template:{template_id}")
    return _response(True)


def _certificate_filtered():
    items = list(portal_state["certificates"])
    status = request.args.get("status")
    search = request.args.get("search", "").lower()
    if status and status != "ALL":
        items = [c for c in items if c["status"] == status]
    if search:
        items = [c for c in items if search in json.dumps(c).lower()]
    return items


@certificate_api.get("/certificates")
def certificates():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    items = _certificate_filtered()
    result = _paginate(items)
    result["countsByStatus"] = {status: sum(c["status"] == status for c in portal_state["certificates"])
                                for status in ("PENDING", "APPROVED", "REJECTED", "GENERATING", "GENERATED", "EMAIL_QUEUED", "SENT", "FAILED")}
    result["total"] = result["pagination"]["total"]
    return _response(result)


@certificate_api.get("/certificates/<certificate_id>")
def certificate_detail(certificate_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = next((c for c in portal_state["certificates"] if c["id"] == certificate_id or c["certificateId"] == certificate_id), None)
    return _response(item) if item else _error("NOT_FOUND", "Certificate not found.", 404)


def _find_certificate(certificate_id):
    return next((c for c in portal_state["certificates"] if c["id"] == certificate_id or c["certificateId"] == certificate_id), None)


@certificate_api.post("/certificates/<certificate_id>/approve")
def approve_certificate(certificate_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = _find_certificate(certificate_id)
    if not item:
        return _error("NOT_FOUND", "Certificate not found.", 404)
    if item["status"] != "PENDING":
        return _error("INVALID_STATE", "Only pending certificates can be approved.", 422)
    item.update({"status": "APPROVED", "approvedBy": os.getenv("ADMIN_EMAIL", "administrator"),
                 "approvedAt": _now(), "approvalComment": (request.get_json(silent=True) or {}).get("comment", "")})
    _save_state()
    _audit("CERTIFICATE_APPROVED", item["certificateId"])
    return _response(item)


@certificate_api.post("/certificates/<certificate_id>/reject")
def reject_certificate(certificate_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = _find_certificate(certificate_id)
    if not item:
        return _error("NOT_FOUND", "Certificate not found.", 404)
    item.update({"status": "REJECTED", "rejectionReason": (request.get_json(silent=True) or {}).get("reason", ""),
                 "rejectedBy": os.getenv("ADMIN_EMAIL", "administrator"), "rejectedAt": _now()})
    _save_state()
    _audit("CERTIFICATE_REJECTED", item["certificateId"], "WARNING", item.get("rejectionReason", ""))
    return _response(item)


@certificate_api.post("/certificates/bulk-approve")
def bulk_approve():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    ids = (request.get_json(silent=True) or {}).get("certificateIds", [])
    results, approved = [], 0
    for identifier in ids:
        item = _find_certificate(identifier)
        if item and item["status"] == "PENDING":
            item.update({"status": "APPROVED", "approvedBy": os.getenv("ADMIN_EMAIL", "administrator"), "approvedAt": _now()})
            results.append({"id": identifier, "status": "APPROVED"})
            approved += 1
        else:
            results.append({"id": identifier, "status": "FAILED", "reason": "Certificate is missing or not pending."})
    _save_state()
    return _response({"total": len(ids), "approved": approved, "approvedCount": approved,
                      "failed": len(ids) - approved, "results": results})


def _render_certificate(item, template):
    if PdfReader is None or canvas is None:
        raise RuntimeError("Certificate rendering dependencies are not installed.")
    stored_template = db.load_file(f"template:{template['id']}")
    if not stored_template:
        raise RuntimeError("Template file not found.")
    source = io.BytesIO(stored_template["data"])
    fields = template.get("fields") or []
    font_map = {
        "Cinzel": "Helvetica-Bold",
        "Playfair Display": "Times-Roman",
        "Inter": "Helvetica",
        "Plus Jakarta Sans": "Helvetica",
        "Great Vibes": "Times-Italic",
        "Helvetica": "Helvetica",
        "Helvetica-Bold": "Helvetica-Bold",
        "Times-Roman": "Times-Roman",
        "Times-Italic": "Times-Italic",
    }
    style_map = {
        "normal": "",
        "italic": "-Oblique",
        "bold": "-Bold",
        "bold italic": "-BoldOblique",
    }
    if template["fileType"] == "PDF":
        reader = PdfReader(source)
        page = reader.pages[0]
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        packet = io.BytesIO()
        overlay = canvas.Canvas(packet, pagesize=(width, height))
        values = {"NAME": item["participantName"], "EMAIL": item["participantEmail"],
                  "STUDENT_ID": item["participantStudentId"], "ROLL_NO": item["participantRollNumber"],
                  "EVENT_NAME": item["eventName"], "DATE": item["issueDate"], "CERTIFICATE_ID": item["certificateId"]}
        for field in fields:
            if field.get("visible", True) is False:
                continue
            key = field.get("key") or field.get("fieldKey")
            value = values.get(key, "")
            x, y = float(field.get("x", field.get("xPercent", 50))) / 100 * width, (100 - float(field.get("y", field.get("yPercent", 50)))) / 100 * height
            overlay.setFillColor(field.get("color", "#111827"))
            base_font = font_map.get(field.get("fontFamily"), "Helvetica")
            style = field.get("fontStyle", "normal")
            font_name = base_font + style_map.get(style, "")
            if font_name not in ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
                                 "Times-Roman", "Times-Italic", "Times-Bold", "Times-BoldItalic"):
                font_name = base_font
            overlay.setFont(font_name, float(field.get("fontSize", 24)))
            alignment = field.get("textAlign", "center")
            if alignment == "left":
                overlay.drawString(x, y, value)
            elif alignment == "right":
                overlay.drawRightString(x, y, value)
            else:
                overlay.drawCentredString(x, y, value)
        overlay.save()
        packet.seek(0)
        page.merge_page(PdfReader(packet).pages[0])
        writer = PdfWriter()
        writer.add_page(page)
        result = io.BytesIO()
        writer.write(result)
        output_bytes = result.getvalue()
    else:
        packet = io.BytesIO()
        overlay = canvas.Canvas(packet, pagesize=(842, 595))
        overlay.drawImage(ImageReader(source), 0, 0, width=842, height=595)
        values = {"NAME": item["participantName"], "EMAIL": item["participantEmail"], "STUDENT_ID": item["participantStudentId"], "ROLL_NO": item["participantRollNumber"], "EVENT_NAME": item["eventName"], "DATE": item["issueDate"], "CERTIFICATE_ID": item["certificateId"]}
        for field in fields:
            if field.get("visible", True) is False:
                continue
            key = field.get("key") or field.get("fieldKey")
            x, y = float(field.get("x", field.get("xPercent", 50))) / 100 * 842, (100 - float(field.get("y", field.get("yPercent", 50)))) / 100 * 595
            overlay.setFillColor(field.get("color", "#111827"))
            base_font = font_map.get(field.get("fontFamily"), "Helvetica")
            style = field.get("fontStyle", "normal")
            font_name = base_font + style_map.get(style, "")
            if font_name not in ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
                                 "Times-Roman", "Times-Italic", "Times-Bold", "Times-BoldItalic"):
                font_name = base_font
            overlay.setFont(font_name, float(field.get("fontSize", 24)))
            alignment = field.get("textAlign", "center")
            value = values.get(key, "")
            if alignment == "left":
                overlay.drawString(x, y, value)
            elif alignment == "right":
                overlay.drawRightString(x, y, value)
            else:
                overlay.drawCentredString(x, y, value)
        overlay.save()
        packet.seek(0)
        output_bytes = packet.read()
    file_key = f"certificate:{item['certificateId']}"
    db.save_file(file_key, f"{item['certificateId']}.pdf", output_bytes, "application/pdf")
    return file_key


@certificate_api.post("/certificates/<certificate_id>/generate")
def generate_certificate(certificate_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = _find_certificate(certificate_id)
    template = next((t for t in portal_state["templates"] if t["id"] == item.get("templateId")), None) if item else None
    if not item or not template:
        return _error("NOT_FOUND", "Certificate or active template not found.", 404)
    if item["status"] not in ("APPROVED", "FAILED"):
        return _error("INVALID_STATE", "Certificate must be approved before generation.", 422)
    job_id = f"job_gen_{uuid.uuid4().hex[:12]}"
    try:
        file_key = _render_certificate(item, template)
        item.update({"status": "GENERATED", "generatedAt": _now(), "certificateUrl": f"/api/v1/jobs/{job_id}/file"})
        job = {"jobId": job_id, "type": "CERTIFICATE_GENERATION", "status": "COMPLETED", "progress": 100, "certificateUrl": item["certificateUrl"], "fileKey": file_key}
    except (OSError, RuntimeError, ValueError) as exc:
        item.update({"status": "FAILED", "failureReason": str(exc)})
        job = {"jobId": job_id, "type": "CERTIFICATE_GENERATION", "status": "FAILED", "progress": None, "certificateUrl": None, "error": str(exc)}
    portal_state.setdefault("jobs", []).append(job)
    _save_state()
    _audit("CERTIFICATE_GENERATED", item["certificateId"], "SUCCESS" if item["status"] == "GENERATED" else "FAILED", item.get("failureReason", ""))
    return _response({"certificateId": item["certificateId"], "status": item["status"], "jobId": job_id})


@certificate_api.get("/jobs/<job_id>")
def job_status(job_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = next((j for j in portal_state.get("jobs", []) if j["jobId"] == job_id), None)
    return _response({key: value for key, value in job.items() if key != "fileKey"}) if job else _error("NOT_FOUND", "Job not found.", 404)


@certificate_api.get("/jobs/<job_id>/file")
def job_file(job_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = next((j for j in portal_state.get("jobs", []) if j["jobId"] == job_id), None)
    if not job or not job.get("fileKey"):
        return _error("NOT_FOUND", "Generated certificate is not available.", 404)
    stored = db.load_file(job["fileKey"])
    if not stored:
        return _error("NOT_FOUND", "Generated certificate is not available.", 404)
    return send_file(io.BytesIO(stored["data"]), as_attachment=True,
                     download_name=stored.get("filename") or "certificate.pdf",
                     mimetype=stored.get("content_type") or "application/pdf")


@certificate_api.post("/certificates/<certificate_id>/send")
def send_certificate(certificate_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    item = _find_certificate(certificate_id)
    if not item or item["status"] != "GENERATED":
        return _error("INVALID_STATE", "A generated certificate is required before sending.", 422)
    email_job_id = f"email_{uuid.uuid4().hex[:12]}"
    job = {"jobId": email_job_id, "certificateId": item["certificateId"], "recipient": item["participantEmail"], "status": "PROCESSING", "createdAt": _now(), "sentAt": None, "attempts": 1}
    host, port = os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT", "587"))
    try:
        if not host or not os.getenv("SMTP_USERNAME") or not os.getenv("SMTP_PASSWORD"):
            raise RuntimeError("Email delivery is not configured.")
        message = EmailMessage()
        message["Subject"] = portal_state["settings"].get("emailSubject") or "Your certificate"
        message["From"] = os.getenv("SMTP_FROM", os.getenv("SMTP_USERNAME"))
        message["To"] = item["participantEmail"]
        message.set_content(portal_state["settings"].get("emailBodyTemplate") or "Your certificate is attached.")
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(os.getenv("SMTP_USERNAME"), os.getenv("SMTP_PASSWORD"))
            smtp.send_message(message)
        job.update({"status": "SENT", "sentAt": _now()})
        item.update({"status": "SENT", "sentAt": job["sentAt"], "emailDeliveryStatus": "SENT"})
        _audit("EMAIL_SENT", item["certificateId"])
    except (OSError, smtplib.SMTPException, RuntimeError) as exc:
        job.update({"status": "FAILED", "error": str(exc)})
        item.update({"status": "FAILED", "emailDeliveryStatus": "FAILED", "failureReason": str(exc)})
        _audit("EMAIL_FAILED", item["certificateId"], "FAILED", str(exc))
    portal_state["emailJobs"].append(job)
    _save_state()
    return _response({"certificateId": item["certificateId"], "status": "EMAIL_QUEUED" if job["status"] == "PROCESSING" else item["status"], "emailJobId": email_job_id})


@certificate_api.get("/email-jobs/<job_id>")
def email_job(job_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = next((j for j in portal_state["emailJobs"] if j["jobId"] == job_id), None)
    return _response(job) if job else _error("NOT_FOUND", "Email job not found.", 404)


@certificate_api.post("/email-jobs/<job_id>/retry")
def retry_email(job_id):
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    job = next((j for j in portal_state["emailJobs"] if j["jobId"] == job_id), None)
    if not job:
        return _error("NOT_FOUND", "Email job not found.", 404)
    return send_certificate(job["certificateId"])


@certificate_api.get("/emails")
def email_logs():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    return _response(_paginate(portal_state["emailJobs"]))


@certificate_api.get("/dashboard/stats")
def dashboard_stats():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    certificates = portal_state["certificates"]
    return _response({
        "participants": len(portal_state["participants"]),
        "eligible": sum(p["eligibility"] == "ELIGIBLE" for p in portal_state["participants"]),
        "ineligible": sum(p["eligibility"] != "ELIGIBLE" for p in portal_state["participants"]),
        "pending": sum(c["status"] == "PENDING" for c in certificates),
        "approved": sum(c["status"] == "APPROVED" for c in certificates),
        "rejected": sum(c["status"] == "REJECTED" for c in certificates),
        "generated": sum(c["status"] == "GENERATED" for c in certificates),
        "sent": sum(c["status"] == "SENT" for c in certificates),
        "failed": sum(c["status"] == "FAILED" for c in certificates),
    })


@certificate_api.get("/audit")
def audit_logs():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    return _response(_paginate(portal_state["auditLogs"]))


@certificate_api.get("/settings")
def get_settings():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    return _response(portal_state["settings"])


@certificate_api.put("/settings")
def update_settings():
    if not _require_admin():
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    body = request.get_json(silent=True) or {}
    blocked = {"smtpPassword", "apiKey", "databasePassword", "privateKey"}
    portal_state["settings"].update({key: value for key, value in body.items() if key not in blocked})
    _save_state()
    _audit("SETTINGS_UPDATED", "system settings")
    return _response(portal_state["settings"])


@certificate_api.get("/public/certificates/<certificate_id>/verify")
def verify_certificate(certificate_id):
    item = _find_certificate(certificate_id)
    if not item or item["status"] not in ("GENERATED", "SENT"):
        return _response({"valid": False, "status": "NOT_FOUND"})
    return _response({"valid": True, "certificateId": item["certificateId"], "name": item["participantName"],
                      "eventName": item["eventName"], "organization": portal_state["settings"]["organizationName"],
                      "issuedAt": item.get("generatedAt") or item["issueDate"], "status": "VALID"})
