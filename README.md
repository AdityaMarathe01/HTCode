 # Udaan — Reporting platform (prototype)

 Short prototype to collect geo-tagged photo reports for NGO / government intake. This repository contains a Node.js + Express backend, a simple SQLite database (`data.db`), and a responsive frontend that supports file upload and in-browser camera capture.

 Quick start (local)

 1. Install dependencies:

 ```powershell
 Set-Location -Path 'C:\Users\Aditya\Desktop\DD'
 npm install
 ```

 2. Copy `.env.example` to `.env` and set secure values **before** the first run (important — admin user is created on first startup):

 ```powershell
 copy .env.example .env
 # then edit .env to set ADMIN_PASS and JWT_SECRET
 ```

 3. Start the server:

 ```powershell
 npm start
 ```

 4. Open the site:

 - Public form: `http://localhost:3000/`
 - Admin UI: `http://localhost:3000/admin.html`

 Mobile camera notes

 - For camera capture (`getUserMedia`) the browser requires HTTPS on mobile devices unless you open the app on the same device as `localhost`.
 - For quick cross-device testing you can use `ngrok` to expose a secure tunnel:

 ```powershell
 # install ngrok and run (example)
 ngrok http 3000
 # use the https:// URL ngrok provides on your phone
 ```

 Hosting / Deployment (recommended options)

 Option A — VPS (recommended for control and file uploads)
 - Provision a small VPS (DigitalOcean, Linode, AWS EC2).
 - SSH, install Node.js (16+), Git, and optionally `pm2`.
 - Clone repo, set `.env`, run `npm install` and `npm start` or `pm2 start server.js`.
 - Install Nginx as a reverse proxy, obtain a TLS certificate via Let's Encrypt (Certbot), and configure secure headers.
 - Use an object store (S3 or compatible) for uploaded images in production (recommended) or mount a persistent volume for `uploads/` on the server.

 Option B — Render / Render.com or similar PaaS
 - Connect your GitHub repo and add a Web Service.
 - Set the start command to `node server.js` and configure environment variables in the Render dashboard.
 - Note: ephemeral file systems on many PaaS providers mean local `uploads/` will not be persistent. Use S3 for long-term storage.

 Option C — Quick share for demo (ngrok)
 - Run locally and `ngrok http 3000` to get an `https://` URL to share. This is only suitable for short demos.

 Production checklist

 - Use a strong `JWT_SECRET` in `.env` and a secure `ADMIN_PASS` before first run.
 - Serve the site over HTTPS.
 - Move file storage to S3 or a persistent filesystem; protect files with signed URLs if necessary.
 - Integrate a content-moderation API to block pornographic/disgusting or violent images before they are processed or displayed (Google Cloud Vision SafeSearch, Azure Content Moderator, AWS Rekognition).
 - Add CAPTCHA (reCAPTCHA v3 or hCaptcha) for the report form to reduce spam.
 - Increase rate limiting and add IP-based abuse rules.
 - Use a managed database (Postgres/MySQL) for scaling — migrate from SQLite when moving to production.
 - Harden CORS to only allow your domains.

 Heroku / Render quick note
 - The repo contains a `Procfile` so Heroku-like services can run `web: node server.js`.
 - For Heroku, you must replace local file storage with S3.

 Troubleshooting

 - `sharp` may require build tools on Windows: install the Visual C++ build tools or run in WSL.
 - If `npm` is blocked by PowerShell policy, run `npm.cmd` or use `cmd.exe` / Administrator PowerShell.

 Security Reminder

 This project is a prototype intended for demonstration. For any real-world or international deployment handling sensitive reports about trafficking, consult legal and security experts, and implement strict operational controls, audit logging, and privacy-preserving policies.
