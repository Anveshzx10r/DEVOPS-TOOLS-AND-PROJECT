import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(rootDir, '..');
const uploadDir = path.join(rootDir, 'uploads');
const dataDir = path.join(rootDir, 'data');
const dbFile = path.join(dataDir, 'permission.db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const SQL = await initSqlJs({
  locateFile: (file) => path.join(workspaceRoot, 'node_modules', 'sql.js', 'dist', file),
});

const db = fs.existsSync(dbFile)
  ? new SQL.Database(fs.readFileSync(dbFile))
  : new SQL.Database();

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryRow(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function execute(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function persistDb() {
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  department_id INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_code TEXT NOT NULL UNIQUE,
  department_name TEXT NOT NULL,
  hod_id INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  roll_number TEXT NOT NULL UNIQUE,
  year TEXT,
  section TEXT,
  department_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faculty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  employee_id TEXT,
  department_id INTEGER,
  designation TEXT,
  is_class_incharge INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  employee_id TEXT,
  department_id INTEGER,
  designation TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS request_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  workflow_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  student_id INTEGER NOT NULL,
  department_id INTEGER NOT NULL,
  request_type_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  reason TEXT,
  status TEXT NOT NULL,
  current_stage TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS request_workflow_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  from_user_id INTEGER,
  to_user_id INTEGER,
  stage TEXT,
  action TEXT,
  remarks TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS request_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT,
  file_path TEXT NOT NULL,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type_id INTEGER NOT NULL,
  department_id INTEGER,
  name TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_type_id, department_id)
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL,
  role TEXT NOT NULL,
  step_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  approver_id INTEGER,
  role TEXT,
  decision TEXT,
  remarks TEXT,
  approved_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  request_id INTEGER,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(schemaSql);
persistDb();

const defaultSettings = [
  ['college_name', 'ABC College'],
  ['college_email', 'info@abccollege.edu'],
  ['allow_resubmission', 'true'],
  ['max_file_size_mb', '10'],
];
for (const [key, value] of defaultSettings) {
  const existing = queryRow('SELECT id FROM system_settings WHERE key = ?', [key]);
  if (!existing) {
    execute('INSERT INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      cb(null, `${unique}-${file.originalname.replace(/\s+/g, '-')}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. Allowed: PDF, JPG, JPEG, PNG'));
  },
});

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getRoleLabel(role) {
  return role || 'STUDENT';
}

function toJSON(row) {
  if (!row) return null;
  const value = { ...row };
  Object.keys(value).forEach((key) => {
    if (value[key] === undefined) value[key] = null;
  });
  return value;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
}

function getTokenFromRequest(req) {
  return req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
}

function authenticate(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = queryRow('SELECT * FROM users WHERE id = ? AND is_active = 1', [payload.id]);
    if (!user) return res.status(401).json({ message: 'Account is inactive or invalid.' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Access denied. Required role: ${roles.join(', ')}` });
    }
    next();
  };
}

function logAudit(userId, action, entityType, entityId, oldValue, newValue) {
  execute(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, action, entityType, String(entityId || ''), oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null],
  );
  persistDb();
}

function createNotification(userId, requestId, title, message) {
  execute(
    'INSERT INTO notifications (user_id, request_id, title, message) VALUES (?, ?, ?, ?)',
    [userId, requestId, title, message],
  );
  persistDb();
}

function generateRequestNumber() {
  const year = new Date().getFullYear();
  const count = queryRow('SELECT COUNT(*) AS total FROM requests WHERE strftime("%Y", created_at) = ? ', [String(year)]);
  const next = Number(count?.total || 0) + 1;
  return `REQ-${year}-${String(next).padStart(5, '0')}`;
}

function ensureWorkflowDefinitions() {
  const types = queryAll('SELECT * FROM request_types');
  for (const type of types) {
    const existing = queryRow('SELECT id FROM workflow_definitions WHERE request_type_id = ? AND department_id IS NULL', [type.id]);
    if (!existing) {
      execute('INSERT INTO workflow_definitions (request_type_id, department_id, name, is_active) VALUES (?, NULL, ?, 1)', [type.id, `${type.name} default workflow`]);
      const workflowId = queryRow('SELECT id FROM workflow_definitions WHERE request_type_id = ? AND department_id IS NULL', [type.id]).id;
      const steps = [
        { role: 'FACULTY', step_name: 'Faculty Review' },
        { role: 'HOD', step_name: 'HOD Approval' },
        { role: 'PRINCIPAL', step_name: 'Principal Approval' },
      ];
      let seq = 1;
      for (const step of steps) {
        execute('INSERT INTO workflow_steps (workflow_id, sequence_no, role, step_name) VALUES (?, ?, ?, ?)', [workflowId, seq, step.role, step.step_name]);
        seq += 1;
      }
    }
  }
}

ensureWorkflowDefinitions();

function getRequestTypeById(typeId) {
  return queryRow('SELECT * FROM request_types WHERE id = ? AND is_active = 1', [typeId]);
}

function getDepartmentById(id) {
  return queryRow('SELECT * FROM departments WHERE id = ? AND is_active = 1', [id]);
}

function getStudentProfile(userId) {
  return queryRow('SELECT * FROM students WHERE user_id = ?', [userId]);
}

function getFacultyProfile(userId) {
  return queryRow('SELECT * FROM faculty WHERE user_id = ?', [userId]);
}

function getHodProfile(userId) {
  return queryRow('SELECT * FROM hods WHERE user_id = ?', [userId]);
}

function getApproverProfileForRequest(requestId) {
  return queryRow('SELECT * FROM approvals WHERE request_id = ? ORDER BY approved_at DESC LIMIT 1', [requestId]);
}

function getWorkflowForRequest(typeId, departmentId) {
  const workflow = queryRow(
    'SELECT * FROM workflow_definitions WHERE request_type_id = ? AND (department_id IS NULL OR department_id = ?) ORDER BY department_id IS NOT NULL DESC LIMIT 1',
    [typeId, departmentId],
  );
  if (!workflow) return { workflowId: null, steps: [] };
  const steps = queryAll('SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY sequence_no ASC', [workflow.id]);
  return { workflowId: workflow.id, steps };
}

function buildRequestResponse(request) {
  const student = queryRow('SELECT * FROM students WHERE id = ?', [request.student_id]);
  const user = safeUserJson(queryRow('SELECT * FROM users WHERE id = ?', [student?.user_id]));
  const department = getDepartmentById(request.department_id);
  const requestType = getRequestTypeById(request.request_type_id);
  const documents = queryAll('SELECT * FROM request_documents WHERE request_id = ?', [request.id]);
  return { ...request, student, user, department, requestType, documents };
}

function safeUserJson(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

function getCurrentApproverForRequest(request) {
  const current = queryRow(
    "SELECT u.name, u.role, d.department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?",
    [request.student_id],
  );
  return current;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, message: 'Permission system backend is running.' }));

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone, department_id, roll_number, year, section } = req.body;
  if (!name || !email || !password || !department_id || !roll_number || !year || !section) {
    return res.status(400).json({ message: 'All student fields are required.' });
  }

  const existingUser = queryRow('SELECT id FROM users WHERE email = ?', [email]);
  if (existingUser) return res.status(409).json({ message: 'Email already registered.' });

  const department = getDepartmentById(Number(department_id));
  if (!department) return res.status(400).json({ message: 'Department not found.' });

  const userId = queryAll('SELECT MAX(id) as max_id FROM users')[0]?.max_id || 0;
  execute(
    'INSERT INTO users (name, email, phone, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, phone || '', hashPassword(password), 'STUDENT', department.id],
  );
  const newUser = queryRow('SELECT * FROM users WHERE email = ?', [email]);
  const studentRoll = `STU-${String(roll_number).toUpperCase()}`;
  execute(
    'INSERT INTO students (user_id, roll_number, year, section, department_id) VALUES (?, ?, ?, ?, ?)',
    [newUser.id, studentRoll, year, section, department.id],
  );

  const token = signToken(newUser);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
  logAudit(newUser.id, 'User registered', 'users', newUser.id, null, { email: newUser.email, role: 'STUDENT' });
  return res.status(201).json({ message: 'Registration successful.', user: safeUserJson(newUser), token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const user = queryRow('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (role && user.role !== role.toUpperCase()) {
    return res.status(403).json({ message: 'Role mismatch for this account.' });
  }

  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
  logAudit(user.id, 'User login', 'users', user.id, null, { role: user.role });
  return res.json({ message: 'Login successful.', user: safeUserJson(user), token });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out.' });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = safeUserJson(req.user);
  return res.json({ user });
});

app.get('/api/departments', authenticate, (req, res) => {
  const dept = queryAll('SELECT * FROM departments WHERE is_active = 1 ORDER BY department_name ASC');
  return res.json({ departments: dept });
});

app.post('/api/departments', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const { department_code, department_name, hod_id } = req.body;
  if (!department_code || !department_name) return res.status(400).json({ message: 'Code and name are required.' });
  const existing = queryRow('SELECT id FROM departments WHERE department_code = ? OR department_name = ?', [String(department_code).trim(), String(department_name).trim()]);
  if (existing) return res.status(409).json({ message: 'Department already exists.' });
  execute(
    'INSERT INTO departments (department_code, department_name, hod_id, is_active) VALUES (?, ?, ?, 1)',
    [String(department_code).toUpperCase(), department_name, hod_id || null],
  );
  const dept = queryRow('SELECT * FROM departments WHERE department_code = ?', [String(department_code).toUpperCase()]);
  logAudit(req.user.id, 'Created department', 'departments', dept.id, null, dept);
  return res.status(201).json({ department: dept });
});

app.put('/api/departments/:id', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const department = queryRow('SELECT * FROM departments WHERE id = ?', [req.params.id]);
  if (!department) return res.status(404).json({ message: 'Department not found.' });
  const { department_name, hod_id, is_active } = req.body;
  execute(
    'UPDATE departments SET department_name = ?, hod_id = ?, is_active = ? WHERE id = ?',
    [department_name || department.department_name, hod_id ?? department.hod_id, is_active ?? department.is_active, department.id],
  );
  const updated = queryRow('SELECT * FROM departments WHERE id = ?', [department.id]);
  logAudit(req.user.id, 'Updated department', 'departments', department.id, department, updated);
  return res.json({ department: updated });
});

app.get('/api/request-types', authenticate, (req, res) => {
  const rows = queryAll('SELECT * FROM request_types WHERE is_active = 1 ORDER BY name ASC');
  return res.json({ requestTypes: rows });
});

app.post('/api/request-types', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const { name, workflow_name } = req.body;
  if (!name) return res.status(400).json({ message: 'Request type name is required.' });
  const existing = queryRow('SELECT id FROM request_types WHERE name = ?', [name]);
  if (existing) return res.status(409).json({ message: 'Request type already exists.' });
  execute('INSERT INTO request_types (name, workflow_name, is_active) VALUES (?, ?, 1)', [name, workflow_name || name]);
  const item = queryRow('SELECT * FROM request_types WHERE name = ?', [name]);
  ensureWorkflowDefinitions();
  logAudit(req.user.id, 'Created request type', 'request_types', item.id, null, item);
  return res.status(201).json({ requestType: item });
});

app.get('/api/workflows', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const rows = queryAll(`
    SELECT wf.id, wf.request_type_id, wf.department_id, wf.name, wf.is_active,
           rt.name AS request_type_name, d.department_name
    FROM workflow_definitions wf
    LEFT JOIN request_types rt ON rt.id = wf.request_type_id
    LEFT JOIN departments d ON d.id = wf.department_id
    ORDER BY rt.name, d.department_name
  `);
  return res.json({ workflows: rows });
});

app.post('/api/workflows', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const { request_type_id, department_id, name, steps } = req.body;
  if (!request_type_id || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ message: 'Request type and steps are required.' });
  }
  const existing = queryRow('SELECT id FROM workflow_definitions WHERE request_type_id = ? AND department_id IS ?', [request_type_id, department_id || null]);
  if (existing) {
    execute('DELETE FROM workflow_steps WHERE workflow_id = ?', [existing.id]);
    execute('UPDATE workflow_definitions SET name = ?, is_active = 1 WHERE id = ?', [name || 'Custom workflow', existing.id]);
    let sequence = 1;
    for (const step of steps) {
      execute('INSERT INTO workflow_steps (workflow_id, sequence_no, role, step_name) VALUES (?, ?, ?, ?)', [existing.id, sequence, step.role, step.step_name]);
      sequence += 1;
    }
    const final = queryRow('SELECT * FROM workflow_definitions WHERE id = ?', [existing.id]);
    logAudit(req.user.id, 'Updated workflow', 'workflow_definitions', final.id, null, final);
    return res.json({ workflow: final });
  }
  execute('INSERT INTO workflow_definitions (request_type_id, department_id, name, is_active) VALUES (?, ?, ?, 1)', [request_type_id, department_id || null, name || 'Custom workflow']);
  const workflow = queryRow('SELECT * FROM workflow_definitions WHERE request_type_id = ? AND department_id IS ?', [request_type_id, department_id || null]);
  let seq = 1;
  for (const step of steps) {
    execute('INSERT INTO workflow_steps (workflow_id, sequence_no, role, step_name) VALUES (?, ?, ?, ?)', [workflow.id, seq, step.role, step.step_name]);
    seq += 1;
  }
  logAudit(req.user.id, 'Created workflow', 'workflow_definitions', workflow.id, null, workflow);
  return res.status(201).json({ workflow });
});

app.get('/api/notifications', authenticate, (req, res) => {
  const rows = queryAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  return res.json({ notifications: rows });
});

app.put('/api/notifications/:id/read', authenticate, (req, res) => {
  execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  const updated = queryRow('SELECT * FROM notifications WHERE id = ?', [req.params.id]);
  return res.json({ notification: updated });
});

app.get('/api/admin/audit-logs', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const logs = queryAll('SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 200');
  return res.json({ logs });
});

app.get('/api/admin/stats', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const stats = {
    totalStudents: queryRow('SELECT COUNT(*) AS count FROM users WHERE role = "STUDENT"')?.count || 0,
    totalFaculty: queryRow('SELECT COUNT(*) AS count FROM users WHERE role = "FACULTY"')?.count || 0,
    totalDepartments: queryRow('SELECT COUNT(*) AS count FROM departments WHERE is_active = 1')?.count || 0,
    totalHods: queryRow('SELECT COUNT(*) AS count FROM users WHERE role = "HOD"')?.count || 0,
    totalRequests: queryRow('SELECT COUNT(*) AS count FROM requests')?.count || 0,
    pendingRequests: queryRow('SELECT COUNT(*) AS count FROM requests WHERE status NOT IN ("APPROVED","REJECTED")')?.count || 0,
    approvedRequests: queryRow('SELECT COUNT(*) AS count FROM requests WHERE status = "APPROVED"')?.count || 0,
    rejectedRequests: queryRow('SELECT COUNT(*) AS count FROM requests WHERE status = "REJECTED"')?.count || 0,
  };
  return res.json({ stats });
});

app.get('/api/users', authenticate, requireRole('DEVELOPER'), (req, res) => {
  const rows = queryAll('SELECT * FROM users ORDER BY created_at DESC');
  return res.json({ users: rows.map((user) => safeUserJson(user)) });
});

app.get('/api/students', authenticate, (req, res) => {
  const rows = queryAll(`
    SELECT s.*, u.name, u.email, d.department_name
    FROM students s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN departments d ON d.id = s.department_id
    ORDER BY s.created_at DESC
  `);
  return res.json({ students: rows });
});

app.get('/api/faculty', authenticate, (req, res) => {
  const rows = queryAll(`
    SELECT f.*, u.name, u.email, d.department_name
    FROM faculty f
    LEFT JOIN users u ON u.id = f.user_id
    LEFT JOIN departments d ON d.id = f.department_id
    ORDER BY u.name ASC
  `);
  return res.json({ faculty: rows });
});

app.get('/api/hods', authenticate, (req, res) => {
  const rows = queryAll(`
    SELECT h.*, u.name, u.email, d.department_name
    FROM hods h
    LEFT JOIN users u ON u.id = h.user_id
    LEFT JOIN departments d ON d.id = h.department_id
    ORDER BY u.name ASC
  `);
  return res.json({ hods: rows });
});

function canAccessRequest(user, request) {
  if (user.role === 'DEVELOPER') return true;
  if (user.role === 'STUDENT') {
    const student = getStudentProfile(user.id);
    return student && request.student_id === student.id;
  }
  if (user.role === 'FACULTY') {
    const profile = getFacultyProfile(user.id);
    if (!profile) return false;
    return profile.department_id === request.department_id;
  }
  if (user.role === 'HOD') {
    const profile = getHodProfile(user.id);
    if (!profile) return false;
    return profile.department_id === request.department_id;
  }
  if (user.role === 'PRINCIPAL') return true;
  return false;
}

function setRequestStatus(requestId, newStatus) {
  execute('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?', [newStatus, new Date().toISOString(), requestId]);
  persistDb();
}

const allowedTransitions = {
  STUDENT: ['SUBMITTED'],
  FACULTY: ['SUBMITTED', 'UNDER FACULTY REVIEW', 'FACULTY APPROVED', 'RETURNED FOR CORRECTION'],
  HOD: ['FACULTY APPROVED', 'UNDER HOD REVIEW', 'HOD APPROVED', 'FORWARDED TO PRINCIPAL'],
  PRINCIPAL: ['HOD APPROVED', 'UNDER PRINCIPAL REVIEW', 'APPROVED', 'REJECTED'],
};

function isTransitionAllowed(currentStatus, action, role) {
  const map = {
    STUDENT_SUBMIT: 'SUBMITTED',
    FACULTY_APPROVE: ['SUBMITTED', 'UNDER FACULTY REVIEW'],
    FACULTY_REJECT: ['SUBMITTED', 'UNDER FACULTY REVIEW'],
    FACULTY_FORWARD: ['SUBMITTED', 'UNDER FACULTY REVIEW'],
    FACULTY_RETURN: ['SUBMITTED', 'UNDER FACULTY REVIEW'],
    HOD_APPROVE: ['FACULTY APPROVED', 'UNDER HOD REVIEW'],
    HOD_REJECT: ['FACULTY APPROVED', 'UNDER HOD REVIEW'],
    HOD_FORWARD: ['FACULTY APPROVED', 'UNDER HOD REVIEW'],
    PRINCIPAL_APPROVE: ['HOD APPROVED', 'UNDER PRINCIPAL REVIEW'],
    PRINCIPAL_REJECT: ['HOD APPROVED', 'UNDER PRINCIPAL REVIEW'],
    PRINCIPAL_RETURN: ['HOD APPROVED', 'UNDER PRINCIPAL REVIEW'],
  };

  if (role === 'FACULTY') {
    return ['SUBMITTED', 'UNDER FACULTY REVIEW'].includes(currentStatus);
  }
  if (role === 'HOD') {
    return ['FACULTY APPROVED', 'UNDER HOD REVIEW'].includes(currentStatus);
  }
  if (role === 'PRINCIPAL') {
    return ['HOD APPROVED', 'UNDER PRINCIPAL REVIEW'].includes(currentStatus);
  }
  return false;
}

app.post('/api/requests', authenticate, requireRole('STUDENT'), upload.array('documents', 5), (req, res) => {
  const studentProfile = getStudentProfile(req.user.id);
  if (!studentProfile) return res.status(400).json({ message: 'Student profile not found.' });
  const body = req.body;
  const { subject, description, reason, request_type_id, department_id } = body;
  if (!subject || !description || !reason || !request_type_id) {
    return res.status(400).json({ message: 'Subject, description, reason, and request type are required.' });
  }
  const requestType = getRequestTypeById(Number(request_type_id));
  if (!requestType) return res.status(404).json({ message: 'Request type not found.' });
  const department = getDepartmentById(Number(department_id || studentProfile.department_id));
  if (!department) return res.status(400).json({ message: 'Department not found.' });
  const requestNumber = generateRequestNumber();
  execute(
    'INSERT INTO requests (request_number, student_id, department_id, request_type_id, subject, description, reason, status, current_stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [requestNumber, studentProfile.id, department.id, requestType.id, subject, description, reason, 'SUBMITTED', 'Student'],
  );
  const request = queryRow('SELECT * FROM requests WHERE request_number = ?', [requestNumber]);

  if (req.files && req.files.length) {
    for (const file of req.files) {
      execute(
        'INSERT INTO request_documents (request_id, file_name, original_name, mimetype, file_path) VALUES (?, ?, ?, ?, ?)',
        [request.id, file.filename, file.originalname, file.mimetype, `/uploads/${file.filename}`],
      );
    }
  }

  const studentUser = queryRow('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const faculty = queryRow('SELECT * FROM faculty WHERE department_id = ? LIMIT 1', [department.id]);
  if (faculty) {
    createNotification(faculty.user_id, request.id, 'New request received', `A new ${requestType.name} request was submitted by ${studentUser.name}.`);
  }
  createNotification(req.user.id, request.id, 'Request submitted', `Your request ${requestNumber} has been submitted.`);
  logAudit(req.user.id, 'Submitted request', 'requests', request.id, null, request);
  persistDb();

  return res.status(201).json({ request: buildRequestResponse(request), message: 'Request created successfully.' });
});

app.get('/api/requests', authenticate, (req, res) => {
  if (req.user.role === 'STUDENT') {
    const student = getStudentProfile(req.user.id);
    const rows = queryAll('SELECT * FROM requests WHERE student_id = ? ORDER BY created_at DESC', [student.id]);
    return res.json({ requests: rows });
  }
  if (req.user.role === 'FACULTY') {
    const faculty = getFacultyProfile(req.user.id);
    const rows = queryAll('SELECT * FROM requests WHERE department_id = ? ORDER BY created_at DESC', [faculty.department_id]);
    return res.json({ requests: rows });
  }
  if (req.user.role === 'HOD') {
    const hod = getHodProfile(req.user.id);
    const rows = queryAll('SELECT * FROM requests WHERE department_id = ? ORDER BY created_at DESC', [hod.department_id]);
    return res.json({ requests: rows });
  }
  if (req.user.role === 'PRINCIPAL') {
    const rows = queryAll('SELECT * FROM requests ORDER BY created_at DESC');
    return res.json({ requests: rows });
  }
  const rows = queryAll('SELECT * FROM requests ORDER BY created_at DESC');
  return res.json({ requests: rows });
});

app.get('/api/requests/:id', authenticate, (req, res) => {
  const request = queryRow('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (!canAccessRequest(req.user, request)) return res.status(403).json({ message: 'You do not have access to this request.' });
  const response = buildRequestResponse(request);
  response.history = queryAll('SELECT * FROM request_workflow_history WHERE request_id = ? ORDER BY created_at ASC', [request.id]);
  response.approvals = queryAll('SELECT * FROM approvals WHERE request_id = ? ORDER BY approved_at ASC', [request.id]);
  return res.json({ request: response });
});

function appendWorkflowHistory(requestId, fromUserId, toUserId, stage, action, remarks) {
  execute(
    'INSERT INTO request_workflow_history (request_id, from_user_id, to_user_id, stage, action, remarks) VALUES (?, ?, ?, ?, ?, ?)',
    [requestId, fromUserId, toUserId, stage, action, remarks || ''],
  );
  persistDb();
}

function applyRequestDecision(request, action, remarks, user) {
  const requestType = getRequestTypeById(request.request_type_id);
  const department = getDepartmentById(request.department_id);
  const statusMap = {
    approve: {
      FACULTY: 'FACULTY APPROVED',
      HOD: 'HOD APPROVED',
      PRINCIPAL: 'APPROVED',
      default: 'APPROVED',
    },
    reject: {
      FACULTY: 'REJECTED',
      HOD: 'REJECTED',
      PRINCIPAL: 'REJECTED',
      default: 'REJECTED',
    },
    forward: {
      FACULTY: 'FORWARDED TO HOD',
      HOD: 'FORWARDED TO PRINCIPAL',
      default: 'FORWARDED TO PRINCIPAL',
    },
    return: {
      FACULTY: 'RETURNED FOR CORRECTION',
      HOD: 'RETURNED FOR CORRECTION',
      PRINCIPAL: 'RETURNED FOR CORRECTION',
      default: 'RETURNED FOR CORRECTION',
    },
  };

  const decisionStatus = statusMap[action]?.[user.role] || statusMap[action]?.default || 'SUBMITTED';
  execute(
    'UPDATE requests SET status = ?, current_stage = ?, updated_at = ? WHERE id = ?',
    [decisionStatus, user.role, new Date().toISOString(), request.id],
  );

  execute(
    'INSERT INTO approvals (request_id, approver_id, role, decision, remarks, approved_at) VALUES (?, ?, ?, ?, ?, ?)',
    [request.id, user.id, user.role, action.toUpperCase(), remarks || '', new Date().toISOString()],
  );

  appendWorkflowHistory(request.id, user.id, user.id, user.role, action.toUpperCase(), remarks || '');

  const requestOwner = queryRow('SELECT * FROM users WHERE id = ?', [queryRow('SELECT * FROM students WHERE id = ?', [request.student_id]).user_id]);
  const title = `Request ${action}`;
  createNotification(requestOwner.id, request.id, title, `Your request ${request.request_number} has been ${decisionStatus.toLowerCase()}.`);
  logAudit(user.id, `${action} request`, 'requests', request.id, request.status, decisionStatus);
  persistDb();

  return queryRow('SELECT * FROM requests WHERE id = ?', [request.id]);
}

app.post('/api/requests/:id/approve', authenticate, (req, res) => {
  const request = queryRow('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (!canAccessRequest(req.user, request)) return res.status(403).json({ message: 'You do not have access to approve this request.' });

  if (req.user.role === 'STUDENT') return res.status(403).json({ message: 'Students cannot approve requests.' });
  const allowed = isTransitionAllowed(request.status, 'approve', req.user.role);
  if (!allowed) return res.status(400).json({ message: `Role ${req.user.role} cannot approve this request in status ${request.status}.` });

  const updated = applyRequestDecision(request, 'approve', req.body.remarks || '', req.user);
  return res.json({ request: updated, message: `Request approved by ${req.user.role}.` });
});

app.post('/api/requests/:id/reject', authenticate, (req, res) => {
  const request = queryRow('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (!canAccessRequest(req.user, request)) return res.status(403).json({ message: 'You cannot reject this request.' });
  if (req.user.role === 'STUDENT') return res.status(403).json({ message: 'Students cannot reject requests.' });
  const allowed = isTransitionAllowed(request.status, 'reject', req.user.role);
  if (!allowed) return res.status(400).json({ message: `Role ${req.user.role} cannot reject this request in status ${request.status}.` });

  const updated = applyRequestDecision(request, 'reject', req.body.remarks || '', req.user);
  return res.json({ request: updated, message: `Request rejected by ${req.user.role}.` });
});

app.post('/api/requests/:id/return', authenticate, (req, res) => {
  const request = queryRow('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (!canAccessRequest(req.user, request)) return res.status(403).json({ message: 'You cannot return this request.' });
  if (req.user.role === 'STUDENT') return res.status(403).json({ message: 'Students cannot return requests.' });
  const allowed = isTransitionAllowed(request.status, 'return', req.user.role);
  if (!allowed) return res.status(400).json({ message: `Role ${req.user.role} cannot return this request in status ${request.status}.` });

  const updated = applyRequestDecision(request, 'return', req.body.remarks || '', req.user);
  return res.json({ request: updated, message: `Request returned for correction by ${req.user.role}.` });
});

app.post('/api/requests/:id/forward', authenticate, (req, res) => {
  const request = queryRow('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (!canAccessRequest(req.user, request)) return res.status(403).json({ message: 'You cannot forward this request.' });
  if (req.user.role === 'STUDENT') return res.status(403).json({ message: 'Students cannot forward requests.' });
  const allowed = isTransitionAllowed(request.status, 'forward', req.user.role);
  if (!allowed) return res.status(400).json({ message: `Role ${req.user.role} cannot forward this request in status ${request.status}.` });

  const updated = applyRequestDecision(request, 'forward', req.body.remarks || '', req.user);
  return res.json({ request: updated, message: `Request forwarded by ${req.user.role}.` });
});

app.get('/api/requests/:id/history', authenticate, (req, res) => {
  const request = queryRow('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (!canAccessRequest(req.user, request)) return res.status(403).json({ message: 'You do not have access.' });
  const history = queryAll('SELECT * FROM request_workflow_history WHERE request_id = ? ORDER BY created_at ASC', [req.params.id]);
  return res.json({ history });
});

app.get('/api/requests/:id/pdf', authenticate, async (req, res) => {
  const request = queryRow('SELECT * FROM requests WHERE id = ?', [req.params.id]);
  if (!request) return res.status(404).json({ message: 'Request not found.' });
  if (!canAccessRequest(req.user, request)) return res.status(403).json({ message: 'You do not have access.' });

  const student = queryRow('SELECT * FROM students WHERE id = ?', [request.student_id]);
  const user = queryRow('SELECT * FROM users WHERE id = ?', [student.user_id]);
  const department = queryRow('SELECT * FROM departments WHERE id = ?', [request.department_id]);
  const type = queryRow('SELECT * FROM request_types WHERE id = ?', [request.request_type_id]);

  const doc = new PDFDocument({ margin: 50 });
  const fileName = `${request.request_number}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  doc.pipe(res);
  doc.fontSize(20).text('ABC College', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('Permission Request Letter', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(12).text(`To\nThe Head of the Department\n${department.department_name}\nABC College`);
  doc.moveDown();
  doc.text(`Subject: ${request.subject}`);
  doc.moveDown();
  doc.text(`Respected Sir/Madam,`);
  doc.moveDown();
  doc.text(`I, ${user.name}, bearing Roll Number ${student.roll_number}, from ${student.year}/${student.section}, Department of ${department.department_name}, request permission for ${type.name}.`);
  doc.moveDown();
  doc.text(`Reason: ${request.reason}`);
  doc.moveDown();
  doc.text(`Description: ${request.description}`);
  doc.moveDown();
  doc.text(`Date: ${new Date(request.created_at).toLocaleDateString()}`);
  doc.moveDown();
  doc.text('I kindly request you to consider and approve my request.');
  doc.moveDown(2);
  doc.text('Thanking you.');
  doc.moveDown();
  doc.text('Yours faithfully,');
  doc.moveDown();
  doc.text(user.name);
  doc.text(`Roll Number: ${student.roll_number}`);
  doc.end();
});

app.get('/api/dashboard/summary', authenticate, (req, res) => {
  const summary = {
    totalRequests: queryRow('SELECT COUNT(*) AS count FROM requests')?.count || 0,
    pendingRequests: queryRow('SELECT COUNT(*) AS count FROM requests WHERE status NOT IN ("APPROVED","REJECTED")')?.count || 0,
    approvedRequests: queryRow('SELECT COUNT(*) AS count FROM requests WHERE status = "APPROVED"')?.count || 0,
    rejectedRequests: queryRow('SELECT COUNT(*) AS count FROM requests WHERE status = "REJECTED"')?.count || 0,
  };
  return res.json({ summary });
});

const seeded = queryRow('SELECT * FROM users WHERE email = ?', ['developer@abccollege.edu']);
if (!seeded) {
  const developerPasswordHash = hashPassword('Admin@123');
  execute(
    'INSERT INTO users (name, email, phone, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    ['System Developer', 'developer@abccollege.edu', '0000000000', developerPasswordHash, 'DEVELOPER', null],
  );

  execute('INSERT INTO departments (department_code, department_name, hod_id, is_active) VALUES (?, ?, ?, 1)', ['CSE', 'Computer Science & Engineering', null]);
  execute('INSERT INTO departments (department_code, department_name, hod_id, is_active) VALUES (?, ?, ?, 1)', ['ECE', 'Electronics & Communication', null]);
  execute('INSERT INTO departments (department_code, department_name, hod_id, is_active) VALUES (?, ?, ?, 1)', ['EEE', 'Electrical & Electronics', null]);
  execute('INSERT INTO departments (department_code, department_name, hod_id, is_active) VALUES (?, ?, ?, 1)', ['MECH', 'Mechanical Engineering', null]);
  execute('INSERT INTO departments (department_code, department_name, hod_id, is_active) VALUES (?, ?, ?, 1)', ['CIVIL', 'Civil Engineering', null]);

  const deptCse = queryRow('SELECT id FROM departments WHERE department_code = ?', ['CSE']);
  const deptEce = queryRow('SELECT id FROM departments WHERE department_code = ?', ['ECE']);

  const principalUser = queryRow('SELECT id FROM users WHERE email = ?', ['principal@abccollege.edu']);
  if (!principalUser) {
    execute('INSERT INTO users (name, email, phone, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', ['Dr. Arjun Singh', 'principal@abccollege.edu', '9999999999', hashPassword('Principal@123'), 'PRINCIPAL', null]);
  }
  const principal = queryRow('SELECT * FROM users WHERE email = ?', ['principal@abccollege.edu']);

  const hod1 = queryRow('SELECT id FROM users WHERE email = ?', ['hod.cse@abccollege.edu']);
  if (!hod1) {
    execute('INSERT INTO users (name, email, phone, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', ['Dr. Riya Nair', 'hod.cse@abccollege.edu', '9888888888', hashPassword('Hod@123'), 'HOD', deptCse.id]);
    execute('INSERT INTO hods (user_id, employee_id, department_id, designation, is_active) VALUES (?, ?, ?, ?, 1)', [queryRow('SELECT id FROM users WHERE email = ?', ['hod.cse@abccollege.edu']).id, 'HOD-CSE', deptCse.id, 'Head of Department']);
  }

  const hod2 = queryRow('SELECT id FROM users WHERE email = ?', ['hod.ece@abccollege.edu']);
  if (!hod2) {
    execute('INSERT INTO users (name, email, phone, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', ['Dr. Vinod Sharma', 'hod.ece@abccollege.edu', '9777777777', hashPassword('Hod@123'), 'HOD', deptEce.id]);
    execute('INSERT INTO hods (user_id, employee_id, department_id, designation, is_active) VALUES (?, ?, ?, ?, 1)', [queryRow('SELECT id FROM users WHERE email = ?', ['hod.ece@abccollege.edu']).id, 'HOD-ECE', deptEce.id, 'Head of Department']);
  }

  const facultyEmails = [
    ['Prof. Anand Rao', 'faculty.cse1@abccollege.edu', '9666666666', deptCse.id],
    ['Prof. Meena Iyer', 'faculty.cse2@abccollege.edu', '9555555555', deptCse.id],
    ['Prof. Rakesh Jain', 'faculty.ece1@abccollege.edu', '9444444444', deptEce.id],
    ['Prof. Disha Verma', 'faculty.ece2@abccollege.edu', '9333333333', deptEce.id],
    ['Prof. Suresh Kumar', 'faculty.eee1@abccollege.edu', '9222222222', deptEce.id],
  ];

  for (const [name, email, phone, depId] of facultyEmails) {
    const exists = queryRow('SELECT id FROM users WHERE email = ?', [email]);
    if (!exists) {
      execute('INSERT INTO users (name, email, phone, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', [name, email, phone, hashPassword('Faculty@123'), 'FACULTY', depId]);
      const user = queryRow('SELECT * FROM users WHERE email = ?', [email]);
      execute('INSERT INTO faculty (user_id, employee_id, department_id, designation, is_class_incharge) VALUES (?, ?, ?, ?, 0)', [user.id, `FAC-${String(user.id).padStart(3, '0')}`, depId, 'Assistant Professor']);
    }
  }

  const studentSeeds = [
    ['Aarav Nair', 'student1@abccollege.edu', 'CSE', 'CS-101', '2026', 'A'],
    ['Priya Sharma', 'student2@abccollege.edu', 'CSE', 'CS-102', '2026', 'B'],
    ['Karan Verma', 'student3@abccollege.edu', 'ECE', 'EC-201', '2025', 'A'],
    ['Ananya Singh', 'student4@abccollege.edu', 'ECE', 'EC-202', '2025', 'B'],
    ['Rahul Kumar', 'student5@abccollege.edu', 'MECH', 'ME-301', '2024', 'A'],
    ['Sneha Patel', 'student6@abccollege.edu', 'MECH', 'ME-302', '2024', 'B'],
    ['Vikram Das', 'student7@abccollege.edu', 'CIVIL', 'CV-401', '2026', 'A'],
    ['Nisha Gupta', 'student8@abccollege.edu', 'CIVIL', 'CV-402', '2026', 'B'],
    ['Rohit Sen', 'student9@abccollege.edu', 'EEE', 'EE-501', '2025', 'A'],
    ['Mehak Jain', 'student10@abccollege.edu', 'EEE', 'EE-502', '2025', 'B'],
  ];

  for (const [name, email, deptCode, roll, year, section] of studentSeeds) {
    const dept = queryRow('SELECT * FROM departments WHERE department_code = ?', [deptCode]);
    const exists = queryRow('SELECT id FROM users WHERE email = ?', [email]);
    if (!exists) {
      execute('INSERT INTO users (name, email, phone, password_hash, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', [name, email, '9000000000', hashPassword('Student@123'), 'STUDENT', dept.id]);
      const user = queryRow('SELECT * FROM users WHERE email = ?', [email]);
      execute('INSERT INTO students (user_id, roll_number, year, section, department_id) VALUES (?, ?, ?, ?, ?)', [user.id, roll, year, section, dept.id]);
    }
  }

  const requestTypes = ['OD Permission', 'Leave Permission', 'Bonafide Request', 'Event Permission', 'Industrial Visit', 'Internship Permission', 'Exam Permission', 'Project Permission', 'Lab Permission', 'Hostel Permission', 'Transport Permission', 'Other'];
  for (const name of requestTypes) {
    const exists = queryRow('SELECT id FROM request_types WHERE name = ?', [name]);
    if (!exists) execute('INSERT INTO request_types (name, workflow_name, is_active) VALUES (?, ?, 1)', [name, name]);
  }

  ensureWorkflowDefinitions();

  const cseDept = queryRow('SELECT * FROM departments WHERE department_code = ?', ['CSE']);
  const internshipType = queryRow('SELECT * FROM request_types WHERE name = ?', ['Internship Permission']);
  const studentUser = queryRow('SELECT * FROM users WHERE email = ?', ['student1@abccollege.edu']);
  const studentProfile = queryRow('SELECT * FROM students WHERE user_id = ?', [studentUser.id]);
  const sampleRequestIds = [
    { request_number: 'REQ-2026-00001', status: 'SUBMITTED', subject: 'Internship Permission', description: 'Requesting permission to pursue internship with TechFlow Solutions.', reason: 'Industry exposure and internship requirement', student: studentProfile.id, dept: cseDept.id, type: internshipType.id },
    { request_number: 'REQ-2026-00002', status: 'FORWARDED TO HOD', subject: 'Leave Permission', description: 'Requesting leave for family event.', reason: 'Personal family function', student: studentProfile.id, dept: cseDept.id, type: queryRow('SELECT * FROM request_types WHERE name = ?', ['Leave Permission']).id },
    { request_number: 'REQ-2026-00003', status: 'UNDER PRINCIPAL REVIEW', subject: 'Industrial Visit', description: 'Permission for industrial visit.', reason: 'Academic learning', student: studentProfile.id, dept: cseDept.id, type: queryRow('SELECT * FROM request_types WHERE name = ?', ['Industrial Visit']).id },
    { request_number: 'REQ-2026-00004', status: 'APPROVED', subject: 'Bonafide Request', description: 'Bonafide certificate needed for scholarship.', reason: 'Scholarship processing', student: studentProfile.id, dept: cseDept.id, type: queryRow('SELECT * FROM request_types WHERE name = ?', ['Bonafide Request']).id },
    { request_number: 'REQ-2026-00005', status: 'REJECTED', subject: 'Event Permission', description: 'Permission to organize hackathon.', reason: 'Department event', student: studentProfile.id, dept: cseDept.id, type: queryRow('SELECT * FROM request_types WHERE name = ?', ['Event Permission']).id },
    { request_number: 'REQ-2026-00006', status: 'RETURNED FOR CORRECTION', subject: 'Lab Permission', description: 'Access to electronics lab for project work.', reason: 'Project completion', student: studentProfile.id, dept: cseDept.id, type: queryRow('SELECT * FROM request_types WHERE name = ?', ['Lab Permission']).id },
  ];

  for (const sample of sampleRequestIds) {
    const exists = queryRow('SELECT id FROM requests WHERE request_number = ?', [sample.request_number]);
    if (!exists) {
      execute('INSERT INTO requests (request_number, student_id, department_id, request_type_id, subject, description, reason, status, current_stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [sample.request_number, sample.student, sample.dept, sample.type, sample.subject, sample.description, sample.reason, sample.status, 'Student']);
      const request = queryRow('SELECT * FROM requests WHERE request_number = ?', [sample.request_number]);
      const currentFaculty = queryRow('SELECT * FROM faculty WHERE department_id = ? LIMIT 1', [sample.dept]);
      if (currentFaculty) {
        createNotification(currentFaculty.user_id, request.id, 'Sample request', `Sample request ${sample.request_number} is in progress.`);
      }
    }
  }

  persistDb();
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message || 'Request processing failed.' });
  }
  return res.status(500).json({ message: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
