# API Overview

## Authentication

- POST `/api/auth/login`
- POST `/api/auth/register`
- POST `/api/auth/logout`
- GET `/api/auth/me`

## Departments and requests

- GET `/api/departments`
- GET `/api/departments/:id/faculty`
- POST `/api/departments`
- GET `/api/request-types`
- GET `/api/requests`
- POST `/api/requests`
- GET `/api/requests/:id`
- GET `/api/profile`
- POST `/api/requests/:id/approve`
- POST `/api/requests/:id/reject`
- POST `/api/requests/:id/return`
- POST `/api/requests/:id/forward`
- GET `/api/requests/:id/pdf`

## Admin / developer endpoints

- GET `/api/admin/stats`
- GET `/api/admin/audit-logs`
- GET `/api/workflows`
- POST `/api/workflows`
