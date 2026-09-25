# CertificateFlow portal

This application imports real attendance data, calculates eligibility, configures certificate templates, generates personalized certificates, records email delivery, and exposes public verification.

## Run Locally

**Prerequisites:** Node.js and Python 3.10+

1. Install frontend dependencies: `npm install`.
2. Install Python dependencies: `py -3 -m pip install -r requirements.txt`.
3. Copy [.env.example](.env.example) to `.env` and set `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_FULL_NAME` privately.
4. Start the API: `py -3 backend/app.py` (default `http://localhost:8000`).
5. Start the frontend in a second terminal: `npm run dev`.
6. For real certificate delivery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM`.

The certificate API is under `/api/v1`. No demo username, password, participant, certificate, or email success state is rendered or committed.

## Verification

Run the backend workflow tests:

```powershell
py -m unittest discover -s tests -v
```

The tests use an isolated temporary data directory and do not modify production data.

## Public deployment

The repository includes `Dockerfile` and `render.yaml` for a single-service Render deployment. In Render, choose **New > Blueprint**, connect this repository, and create the service from `render.yaml`. Enter the private `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and SMTP values when prompted. Render will provide the public HTTPS URL after the first successful deploy.

## Public deployment

The repository includes `Dockerfile` and `render.yaml` for a single-service Render deployment. In Render, choose **New > Blueprint**, connect this repository, and create the service from `render.yaml`. Enter the private `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and SMTP values when prompted. Render will provide the public HTTPS URL after the first successful deploy.
