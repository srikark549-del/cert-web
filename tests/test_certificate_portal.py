import io
import os
import unittest

from reportlab.pdfgen import canvas


class CertificatePortalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.getenv("DATABASE_URL"):
            raise unittest.SkipTest(
                "DATABASE_URL is not set. These tests now hit real Postgres "
                "(the JSON-on-disk state was removed); point DATABASE_URL at "
                "a scratch/test database before running them."
            )
        os.environ.update({
            "ADMIN_EMAIL": "admin@example.test",
            "ADMIN_PASSWORD": "test-password",
            "ADMIN_FULL_NAME": "Test Administrator",
            "JWT_SECRET": "test-secret",
            "SMTP_HOST": "",
            "SMTP_USERNAME": "",
            "SMTP_PASSWORD": "",
        })
        from backend import db
        from backend.app import app

        # Start from a clean slate: this suite asserts on absolute counts
        # (e.g. "1 certificate created"), which only holds if the state
        # table is empty before the run. Only ever point this at a
        # disposable test database.
        db.init()
        with db._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM certificate_portal_state")
                cur.execute("DELETE FROM certificate_portal_files")

        cls.db = db
        cls.client = app.test_client()

    @classmethod
    def tearDownClass(cls):
        with cls.db._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM certificate_portal_state")
                cur.execute("DELETE FROM certificate_portal_files")

    def api_data(self, response, expected_status=200):
        self.assertEqual(response.status_code, expected_status, response.get_json())
        payload = response.get_json()
        self.assertTrue(payload["success"], payload)
        return payload.get("data")

    def login(self):
        data = self.api_data(self.client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.test", "password": "test-password"},
        ))
        return {"Authorization": f"Bearer {data['accessToken']}"}

    @staticmethod
    def template_pdf():
        output = io.BytesIO()
        document = canvas.Canvas(output, pagesize=(842, 595))
        document.drawString(20, 570, "Certificate template")
        document.save()
        output.seek(0)
        return output

    def test_unauthenticated_private_routes_are_rejected(self):
        response = self.client.get("/api/v1/dashboard/stats")
        self.assertEqual(response.status_code, 401)
        response = self.client.get("/api/v1/templates/template-missing")
        self.assertEqual(response.status_code, 401)

    def test_import_generate_verify_and_record_email_failure(self):
        headers = self.login()
        self.api_data(self.client.put(
            "/api/v1/settings",
            headers=headers,
            json={
                "eventName": "Test Event",
                "organizationName": "Test Organization",
                "issueDate": "2026-09-25",
            },
        ))

        template = self.api_data(self.client.post(
            "/api/v1/templates",
            headers=headers,
            data={
                "name": "Test Template",
                "file": (self.template_pdf(), "template.pdf"),
            },
            content_type="multipart/form-data",
        ), expected_status=201)
        template_id = template["id"]
        configured_fields = [{
            "key": "NAME",
            "xPercent": 50,
            "yPercent": 50,
            "fontSize": 24,
            "fontFamily": "Cinzel",
            "fontStyle": "bold",
            "color": "#123456",
            "textAlign": "center",
            "visible": True,
        }]
        self.api_data(self.client.put(
            f"/api/v1/templates/{template_id}/fields",
            headers=headers,
            json={"fields": configured_fields},
        ))
        saved_template = self.api_data(self.client.get(
            f"/api/v1/templates/{template_id}", headers=headers
        ))
        self.assertEqual(saved_template["fields"], configured_fields)

        attendance = (
            b"Name,Email,Student ID,Roll No,Check-in,Check-out\n"
            b"Ada Lovelace,ada@example.test,STU-1,ROLL-1,09:00,17:00\n"
        )
        imported = self.api_data(self.client.post(
            "/api/v1/imports",
            headers=headers,
            data={"file": (io.BytesIO(attendance), "attendance.csv")},
            content_type="multipart/form-data",
        ), expected_status=201)
        import_id = imported["importId"]
        validation = self.api_data(self.client.post(
            f"/api/v1/imports/{import_id}/validate",
            headers=headers,
            json={},
        ))
        self.assertEqual(validation["eligibleRecords"], 1)
        confirmed = self.api_data(self.client.post(
            f"/api/v1/imports/{import_id}/confirm",
            headers=headers,
            json={},
        ))
        self.assertEqual(confirmed["certificateRequestsCreated"], 1)

        certificate = self.api_data(self.client.get(
            "/api/v1/certificates", headers=headers
        ))["items"][0]
        certificate_id = certificate["id"]
        self.api_data(self.client.post(
            f"/api/v1/certificates/{certificate_id}/approve",
            headers=headers,
            json={"comment": "approved"},
        ))
        generated = self.api_data(self.client.post(
            f"/api/v1/certificates/{certificate_id}/generate",
            headers=headers,
        ))
        self.assertEqual(generated["status"], "GENERATED")
        generated_file = self.client.get(
            f"/api/v1/jobs/{generated['jobId']}/file", headers=headers
        )
        self.assertEqual(generated_file.status_code, 200)
        generated_file.close()

        verification = self.api_data(self.client.get(
            f"/api/v1/public/certificates/{certificate['certificateId']}/verify"
        ))
        self.assertTrue(verification["valid"])
        self.assertEqual(verification["name"], "Ada Lovelace")

        delivery = self.api_data(self.client.post(
            f"/api/v1/certificates/{certificate_id}/send",
            headers=headers,
        ))
        self.assertEqual(delivery["status"], "FAILED")
        logs = self.api_data(self.client.get("/api/v1/emails", headers=headers))
        self.assertEqual(logs["items"][0]["status"], "FAILED")


if __name__ == "__main__":
    unittest.main()
