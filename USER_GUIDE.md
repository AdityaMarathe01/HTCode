# Udaan — Quick User Guide

This short guide explains how to use the Udaan reporting site and what admins can do.

Public users (reporting)
- Open the site URL provided by the project owner (example: https://your-service-url/).
- Allow Location and Camera permissions when the browser asks — location is required to submit reports.
- Choose one of the following to attach a photo:
  - Tap the folder icon (Choose file) to select a picture from your device.
  - Tap the camera icon to open the in-browser camera and capture a photo.
- The app will show a preview. Confirm the preview and press `Submit Report` to upload.
- You can optionally enter `Name` and `Phone` (these are optional fields).
- After a successful submit you will see a confirmation message.

Admin users
- Admins can sign in at `/admin.html`.
- The initial admin account is created from environment variables set by the owner (`ADMIN_USER`, `ADMIN_PASS`).
- After login, the admin dashboard shows a table of reports with images, location, and severity.
- Admins can `Verify` reports or `Delete` them. Verified items are marked for follow-up.

Privacy & Safety
- Photos have EXIF metadata stripped on upload to remove GPS from image files; the app still stores the latitude/longitude in the report record.
- This is a reporting intake prototype — do not rely on it for emergency response. For production use, a secure and audited workflow must be implemented.

If the site shows an error
- If the app displays an error about file size, try using the camera to take a lower-resolution photo or choose a smaller file.
- If location is not obtained, ensure browser permissions are enabled and you are using HTTPS.

Owner / Maintainer notes
- Set strong secrets in the Render environment: `ADMIN_PASS`, `JWT_SECRET`.
- For production, move `uploads/` to S3 and `data.db` to Postgres. Contact the maintainer for migration assistance.

Contact
- For help, contact the project owner who shared the site URL.
