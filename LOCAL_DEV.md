# Local Development Setup for HTCode Trafficking Reporting App

## Prerequisites
- Node.js (v16 or newer recommended)
- npm (comes with Node.js)

## 1. Install dependencies
```
npm install
```

## 2. Configure Environment Variables
- Copy `.env.example` to `.env` and set values as needed (admin user/pass, JWT secret, etc).

## 3. Run the App Locally
```
npm start
```
- The app will run at http://localhost:3000 by default.

## 4. Usage
- Open http://localhost:3000 in your browser.
- Submit a report with a photo and location.
- View recent report images in the gallery below the form.
- Admin dashboard: http://localhost:3000/admin

## 5. Troubleshooting
- If port 3000 is in use, set a different `PORT` in your `.env` file.
- For database issues, delete `data.db` to reset (removes all reports).

## 6. Notes
- Uploaded images are stored in `/uploads`.
- All reports are stored in `data.db` (SQLite).
- For production, use HTTPS and secure environment variables.

---

For more, see `USER_GUIDE.md` or contact the maintainer.
