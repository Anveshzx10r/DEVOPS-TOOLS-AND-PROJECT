# Multi-Department Digital Permission Management System

A full-stack permission management platform for colleges and universities built with React, Vite, Express, and SQLite-compatible in-memory database (sql.js).

## Features

- Student registration and login
- Separate developer/admin portal at `/developer/login`
- Role-based access for Student, Faculty, HOD, Principal, and Developer
- Request creation with file attachments
- Workflow-driven approval flow
- Digital PDF letter generation
- Internal notifications and audit logging
- Department and request type management
- Responsive dashboard UI

## Default credentials

- Developer: `developer@abccollege.edu` / `Admin@123`
- Student: `student1@abccollege.edu` / `Student@123`
- Faculty: `faculty.cse1@abccollege.edu` / `Faculty@123`
- HOD: `hod.cse@abccollege.edu` / `Hod@123`
- Principal: `principal@abccollege.edu` / `Principal@123`

## Local setup

1. Install Node.js 18+ and npm.
2. Copy `.env.example` to `.env` and update values as needed.
3. Run:

```bash
npm install
npm run dev
```

The app will start on:

- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## Project structure

- `backend/` - Express API and SQLite-backed data layer
- `frontend/` - React dashboard SPA
- `database/` - schema and seed data support
- `docs/` - API documentation

## Notes

- Uploaded files are stored in `backend/uploads`.
- PDF generation is handled with `pdfkit`.
- The backend uses secure JWT auth and bcrypt password hashing.
- The application uses a local SQLite file in `backend/data/permission.db`.
