import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';

const API = '/api';

function logoText(role) {
  switch (role) {
    case 'STUDENT':
      return 'Student Portal';
    case 'FACULTY':
      return 'Faculty Portal';
    case 'HOD':
      return 'HOD Portal';
    case 'PRINCIPAL':
      return 'Principal Portal';
    case 'DEVELOPER':
      return 'Developer Portal';
    default:
      return 'Permission System';
  }
}

function useUserSession() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('permission-user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function refresh() {
      try {
        const response = await fetch(`${API}/auth/me`, { credentials: 'include' });
        if (!response.ok) {
          setUser(null);
          localStorage.removeItem('permission-user');
          return;
        }
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem('permission-user', JSON.stringify(data.user));
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    if (user) refresh();
    else setLoading(false);
  }, [user?.id]);

  return { user, setUser, loading };
}

function getStatusBadge(status) {
  const map = {
    APPROVED: 'status-green',
    REJECTED: 'status-red',
    'RETURNED FOR CORRECTION': 'status-blue',
    'SUBMITTED': 'status-yellow',
    'UNDER FACULTY REVIEW': 'status-yellow',
    'FORWARDED TO HOD': 'status-yellow',
    'UNDER HOD REVIEW': 'status-yellow',
    'FORWARDED TO PRINCIPAL': 'status-yellow',
    'UNDER PRINCIPAL REVIEW': 'status-yellow',
    'FACULTY APPROVED': 'status-green',
    'HOD APPROVED': 'status-green',
  };
  return <span className={`status-badge ${map[status] || 'status-yellow'}`}>{status}</span>;
}

function logout() {
  fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
  localStorage.removeItem('permission-user');
  window.location.href = '/login';
}

function DashboardLayout({ user, children, title }) {
  const navigate = useNavigate();
  const menu = [
    { label: 'Dashboard', to: getDashboardRoute(user?.role) },
    { label: 'Requests', to: '/requests' },
    { label: 'Profile', to: '/profile' },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon">P</div>
          <div>
            <strong>Permission</strong>
            <small>{logoText(user?.role)}</small>
          </div>
        </div>
        <nav className="nav">
          {menu.map((item) => (
            <button key={item.label} className="nav-button" onClick={() => navigate(item.to)}>{item.label}</button>
          ))}
          <button className="nav-button danger" onClick={logout}>Logout</button>
        </nav>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>Welcome, {user?.name}</p>
          </div>
          <div className="user-pill">{user?.role}</div>
        </header>
        {children}
      </main>
    </div>
  );
}

function getDashboardRoute(role) {
  switch (role) {
    case 'STUDENT':
      return '/student-dashboard';
    case 'FACULTY':
      return '/faculty-dashboard';
    case 'HOD':
      return '/hod-dashboard';
    case 'PRINCIPAL':
      return '/principal-dashboard';
    case 'DEVELOPER':
      return '/developer-dashboard';
    default:
      return '/login';
  }
}

function LoginPage({ developerMode = false }) {
  const [form, setForm] = useState({ email: developerMode ? 'developer@abccollege.edu' : 'student1@abccollege.edu', password: developerMode ? 'Admin@123' : 'Student@123', role: developerMode ? 'DEVELOPER' : 'STUDENT' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = developerMode ? { ...form, role: 'DEVELOPER' } : form;
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.message || 'Login failed');
    localStorage.setItem('permission-user', JSON.stringify(data.user));
    window.location.href = getDashboardRoute(data.user.role);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{developerMode ? 'Developer Portal Login' : 'Multi-Department Permission System'}</h1>
        <p className="muted">{developerMode ? 'Secure system administration access' : 'Sign in to continue'}</p>
        <form onSubmit={handleSubmit} className="stack-form">
          {!developerMode ? (
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="STUDENT">Student</option>
              <option value="FACULTY">Faculty</option>
              <option value="HOD">HOD</option>
              <option value="PRINCIPAL">Principal</option>
            </select>
          ) : null}
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" />
          {error ? <div className="error-box">{error}</div> : null}
          <button type="submit" className="primary-btn">Login</button>
        </form>
        <div className="auth-links">
          {!developerMode ? <Link to="/register">Create student account</Link> : <Link to="/login">User login</Link>}
          {!developerMode ? <Link to="/developer/login">Developer login</Link> : null}
        </div>
      </div>
    </div>
  );
}

function DeveloperLoginPage() {
  return <LoginPage developerMode={true} />;
}

function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', department_id: '1', roll_number: 'CS-101', year: '2026', section: 'A' });
  const [result, setResult] = useState('');
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetch(`${API}/departments`, { credentials: 'include' }).then(async (r) => {
      const data = await r.json();
      if (data.departments) setDepartments(data.departments);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return setResult(data.message || 'Registration failed');
    localStorage.setItem('permission-user', JSON.stringify(data.user));
    window.location.href = '/student-dashboard';
  };

  return (
    <div className="auth-page">
      <div className="auth-card wide-card">
        <h1>Student Registration</h1>
        <form onSubmit={handleSubmit} className="grid-form">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required />
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" type="password" required />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
          <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
          </select>
          <input value={form.roll_number} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} placeholder="Roll number" required />
          <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Year" required />
          <input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="Section" required />
          <button type="submit" className="primary-btn">Register</button>
        </form>
        {result ? <div className="error-box">{result}</div> : null}
      </div>
    </div>
  );
}

function StudentDashboard() {
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState({ totalRequests: 0, pendingRequests: 0, approvedRequests: 0, rejectedRequests: 0, returnedRequests: 0 });
  const [requestTypes, setRequestTypes] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [form, setForm] = useState({ subject: '', description: '', reason: '', request_type_id: '', assigned_faculty_id: '' });
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [departmentName, setDepartmentName] = useState('your department');
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');

  useEffect(() => {
    fetchRequests();
    async function loadFormOptions() {
      try {
        const [typeResponse, departmentResponse, facultyResponse] = await Promise.all([
          fetch(`${API}/request-types`, { credentials: 'include' }),
          fetch(`${API}/departments`, { credentials: 'include' }),
          fetch(`${API}/departments/${user.department_id}/faculty`, { credentials: 'include' }),
        ]);
        const [typeData, departmentData, facultyData] = await Promise.all([
          typeResponse.json(),
          departmentResponse.json(),
          facultyResponse.json(),
        ]);
        if (!typeResponse.ok || !departmentResponse.ok || !facultyResponse.ok) {
          throw new Error(facultyData.message || typeData.message || departmentData.message || 'Could not load request options.');
        }
        const types = typeData.requestTypes || [];
        const availableFaculty = facultyData.faculty || [];
        setRequestTypes(types);
        setFaculty(availableFaculty);
        setDepartmentName(departmentData.departments?.find((department) => department.id === user.department_id)?.department_name || 'your department');
        setForm((current) => ({
          ...current,
          request_type_id: current.request_type_id || String(types[0]?.id || ''),
          assigned_faculty_id: current.assigned_faculty_id || String(availableFaculty[0]?.id || ''),
        }));
      } catch (error) {
        setMessage(error.message);
        setMessageType('error');
      }
    }
    loadFormOptions();
  }, [user.department_id]);

  const fetchRequests = async () => {
    const response = await fetch(`${API}/requests`, { credentials: 'include' });
    const data = await response.json();
    if (data.requests) {
      setRequests(data.requests);
      setSummary({
        totalRequests: data.requests.length,
        pendingRequests: data.requests.filter((r) => !['APPROVED', 'REJECTED'].includes(r.status)).length,
        approvedRequests: data.requests.filter((r) => r.status === 'APPROVED').length,
        rejectedRequests: data.requests.filter((r) => r.status === 'REJECTED').length,
        returnedRequests: data.requests.filter((r) => r.status === 'RETURNED FOR CORRECTION').length,
      });
    }
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    setMessage('');
    const fd = new FormData();
    Object.entries(form).forEach(([key, value]) => fd.append(key, value));
    files.forEach((file) => fd.append('documents', file));
    const response = await fetch(`${API}/requests`, { method: 'POST', body: fd, credentials: 'include' });
    const data = await response.json();
    if (!response.ok) {
      setMessageType('error');
      return setMessage(data.message || 'Request failed');
    }
    setMessageType('success');
    setMessage(data.message || 'Request submitted');
    setForm((current) => ({ ...current, subject: '', description: '', reason: '' }));
    setFiles([]);
    fetchRequests();
  };

  const selectDocuments = (event) => {
    const selected = Array.from(event.target.files || []);
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const invalidFile = selected.find((file) => !allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024);
    if (selected.length > 5 || invalidFile) {
      setFiles([]);
      event.target.value = '';
      setMessageType('error');
      setMessage(selected.length > 5
        ? 'You can attach up to five documents.'
        : `${invalidFile.name} must be a PDF, JPG, or PNG no larger than 10 MB.`);
      return;
    }
    setFiles(selected);
    setMessage('');
  };

  return (
    <DashboardLayout user={user} title="Student Dashboard">
      <div className="stats-grid">
        <StatCard label="Total Requests" value={summary.totalRequests} />
        <StatCard label="Pending Requests" value={summary.pendingRequests} />
        <StatCard label="Approved Requests" value={summary.approvedRequests} />
        <StatCard label="Rejected Requests" value={summary.rejectedRequests} />
        <StatCard label="Returned Requests" value={summary.returnedRequests} />
      </div>
      <div className="panel-grid">
        <section className="card">
          <h3>New permission request</h3>
          <p className="muted">Your request will be reviewed by your selected faculty member first, then sent to the HOD.</p>
          <form className="stack-form" onSubmit={submitRequest}>
            <fieldset className="form-section">
              <legend>1. Request details</legend>
              <label>Department
                <input value={departmentName} readOnly aria-readonly="true" />
              </label>
              <label>Request type
                <select value={form.request_type_id} onChange={(e) => setForm({ ...form, request_type_id: e.target.value })} required>
                  <option value="">Choose a request type</option>
                  {requestTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
              <label>Subject
                <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="For example: Permission to attend a workshop" required />
              </label>
              <label>What permission do you need?
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the dates, place, activity, or other important details." rows="4" required />
              </label>
              <label>Reason for your request
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Explain why you need this permission." rows="3" required />
              </label>
            </fieldset>
            <fieldset className="form-section">
              <legend>2. Who are you requesting permission from?</legend>
              <label>Reviewing faculty member
                <select
                  value={form.assigned_faculty_id}
                  onChange={(e) => setForm({ ...form, assigned_faculty_id: e.target.value })}
                  required
                  disabled={!faculty.length}
                >
                  <option value="">Choose a faculty member</option>
                  {faculty.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}{member.designation ? ` - ${member.designation}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="form-hint">After faculty review, the request automatically goes to your department HOD.</p>
            </fieldset>
            <fieldset className="form-section">
              <legend>3. Supporting documents</legend>
              <label>Attachments (PDF, JPG or PNG; up to 10 MB each)
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={selectDocuments} />
              </label>
            </fieldset>
            {message ? <div className={messageType === 'error' ? 'error-box' : 'success-box'} role="status">{message}</div> : null}
            <button type="submit" className="primary-btn" disabled={!faculty.length || !requestTypes.length}>
              Submit request to faculty
            </button>
          </form>
        </section>
        <section className="card">
          <h3>Recent Requests</h3>
          <table>
            <thead>
              <tr><th>ID</th><th>Type</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {requests.slice(0, 6).map((req) => (
                <tr key={req.id}>
                  <td>{req.request_number}</td>
                  <td>{req.requestType?.name || 'Request'}</td>
                  <td>{getStatusBadge(req.status)}</td>
                  <td><a href={`/api/requests/${req.id}/pdf`} target="_blank">PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardLayout>
  );
}

function FacultyDashboard() {
  const [requests, setRequests] = useState([]);
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');

  useEffect(() => { fetchRequests(); }, []);
  const fetchRequests = async () => {
    const res = await fetch(`${API}/requests`, { credentials: 'include' });
    const data = await res.json();
    setRequests(data.requests || []);
  };

  const act = async (requestId, action) => {
    const res = await fetch(`${API}/requests/${requestId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ remarks: 'Processed via portal' }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Could not process this request.');
      return;
    }
    alert(data.message || 'Action completed.');
    fetchRequests();
  };

  return (
    <DashboardLayout user={user} title="Faculty Dashboard">
      <div className="stats-grid">
        <StatCard label="Pending Requests" value={requests.filter((r) => !['APPROVED', 'REJECTED'].includes(r.status)).length} />
        <StatCard label="Approved Today" value={requests.filter((r) => r.status === 'FACULTY APPROVED').length} />
        <StatCard label="Rejected" value={requests.filter((r) => r.status === 'REJECTED').length} />
        <StatCard label="Total Requests" value={requests.length} />
      </div>
      <section className="card">
        <h3>Assigned Requests</h3>
        <table>
          <thead><tr><th>ID</th><th>Student</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.id}>
                <td>{req.request_number}</td>
                <td>{req.user?.name || 'Student'}<br /><small>{req.student?.roll_number}</small></td>
                <td>{req.requestType?.name}<br /><small>{req.subject}</small></td>
                <td>{getStatusBadge(req.status)}</td>
                <td>
                  {req.current_approver_id === user.id && ['SUBMITTED', 'UNDER FACULTY REVIEW'].includes(req.status) ? (
                    <>
                      <button onClick={() => act(req.id, 'approve')}>Approve & send to HOD</button>
                      <button onClick={() => act(req.id, 'reject')}>Reject</button>
                      <button onClick={() => act(req.id, 'return')}>Return for correction</button>
                    </>
                  ) : <span className="muted">No action required</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DashboardLayout>
  );
}

function HodDashboard() {
  const [requests, setRequests] = useState([]);
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');
  useEffect(() => { fetchRequests(); }, []);
  const fetchRequests = async () => {
    const res = await fetch(`${API}/requests`, { credentials: 'include' });
    const data = await res.json();
    setRequests(data.requests || []);
  };

  const act = async (requestId, action) => {
    const res = await fetch(`${API}/requests/${requestId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ remarks: 'Reviewed by HOD' }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Could not process this request.');
      return;
    }
    alert(data.message || 'Action completed.');
    fetchRequests();
  };

  return (
    <DashboardLayout user={user} title="HOD Dashboard">
      <div className="stats-grid">
        <StatCard label="Department Requests" value={requests.length} />
        <StatCard label="Pending Approvals" value={requests.filter((r) => !['APPROVED', 'REJECTED'].includes(r.status)).length} />
        <StatCard label="Approved" value={requests.filter((r) => r.status === 'APPROVED').length} />
        <StatCard label="Rejected" value={requests.filter((r) => r.status === 'REJECTED').length} />
      </div>
      <section className="card">
        <h3>Department Review Queue</h3>
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.id}>
                <td>{req.request_number}</td>
                <td>{req.user?.name}<br /><small>{req.student?.roll_number} · {req.requestType?.name} · {req.subject}</small></td>
                <td>{getStatusBadge(req.status)}</td>
                <td>
                  {req.current_approver_id === user.id ? (
                    <>
                      <button onClick={() => act(req.id, 'approve')}>Approve request</button>
                      <button onClick={() => act(req.id, 'reject')}>Reject</button>
                      <button onClick={() => act(req.id, 'return')}>Return for correction</button>
                    </>
                  ) : <span className="muted">No action required</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DashboardLayout>
  );
}

function PrincipalDashboard() {
  const [requests, setRequests] = useState([]);
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');
  useEffect(() => { fetchRequests(); }, []);
  const fetchRequests = async () => {
    const res = await fetch(`${API}/requests`, { credentials: 'include' });
    const data = await res.json();
    setRequests(data.requests || []);
  };

  const act = async (requestId, action) => {
    const res = await fetch(`${API}/requests/${requestId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ remarks: 'Principal review' }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Could not process this request.');
      return;
    }
    alert(data.message || 'Action completed.');
    fetchRequests();
  };

  return (
    <DashboardLayout user={user} title="Principal Dashboard">
      <div className="stats-grid">
        <StatCard label="Total Requests" value={requests.length} />
        <StatCard label="Pending Requests" value={requests.filter((r) => !['APPROVED', 'REJECTED'].includes(r.status)).length} />
        <StatCard label="Approved" value={requests.filter((r) => r.status === 'APPROVED').length} />
        <StatCard label="Rejected" value={requests.filter((r) => r.status === 'REJECTED').length} />
      </div>
      <section className="card">
        <h3>Institution Overview</h3>
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.id}>
                <td>{req.request_number}</td>
                <td>{req.user?.name}<br /><small>{req.student?.roll_number} · {req.requestType?.name} · {req.subject}</small></td>
                <td>{getStatusBadge(req.status)}</td>
                <td>
                  {req.current_approver_id === user.id ? (
                    <>
                      <button onClick={() => act(req.id, 'approve')}>Approve</button>
                      <button onClick={() => act(req.id, 'reject')}>Reject</button>
                      <button onClick={() => act(req.id, 'return')}>Return for correction</button>
                    </>
                  ) : <span className="muted">No action required</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DashboardLayout>
  );
}

function DeveloperDashboard() {
  const [stats, setStats] = useState({});
  const [requestTypes, setRequestTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');

  useEffect(() => {
    fetchStats();
    fetch(`${API}/request-types`, { credentials: 'include' }).then(async (r) => {
      const data = await r.json();
      setRequestTypes(data.requestTypes || []);
    });
    fetch(`${API}/departments`, { credentials: 'include' }).then(async (r) => {
      const data = await r.json();
      setDepartments(data.departments || []);
    });
  }, []);

  const fetchStats = async () => {
    const res = await fetch(`${API}/admin/stats`, { credentials: 'include' });
    const data = await res.json();
    setStats(data.stats || {});
  };

  return (
    <DashboardLayout user={user} title="Developer Dashboard">
      <div className="stats-grid">
        <StatCard label="Students" value={stats.totalStudents || 0} />
        <StatCard label="Faculty" value={stats.totalFaculty || 0} />
        <StatCard label="Departments" value={stats.totalDepartments || 0} />
        <StatCard label="HODs" value={stats.totalHods || 0} />
        <StatCard label="Requests" value={stats.totalRequests || 0} />
      </div>
      <div className="panel-grid">
        <section className="card">
          <h3>Request Types</h3>
          <ul className="list-stack">
            {requestTypes.map((t) => <li key={t.id}>{t.name}</li>)}
          </ul>
        </section>
        <section className="card">
          <h3>Departments</h3>
          <ul className="list-stack">
            {departments.map((d) => <li key={d.id}>{d.department_name}</li>)}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}

function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');

  useEffect(() => {
    fetch(`${API}/requests`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load requests.');
        setRequests(data.requests || []);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  const visibleRequests = requests.filter((request) =>
    `${request.request_number} ${request.requestType?.name || ''} ${request.status}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout user={user} title="Requests">
      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Request tracking</h3>
            <p className="muted">Search requests and open a request to view its review history.</p>
          </div>
          <input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search request ID, type, or status" />
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Request ID</th><th>Type</th><th>Subject</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.request_number}</td>
                  <td>{request.requestType?.name || 'Request'}</td>
                  <td>{request.subject}</td>
                  <td>{new Date(request.created_at).toLocaleDateString()}</td>
                  <td>{getStatusBadge(request.status)}</td>
                  <td className="table-actions">
                    <Link to={`/requests/${request.id}`}>Track details</Link>
                    <a href={`${API}/requests/${request.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                  </td>
                </tr>
              ))}
              {!visibleRequests.length ? <tr><td colSpan="6" className="empty-state">No requests match your search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardLayout>
  );
}

function RequestDetailsPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');

  useEffect(() => {
    fetch(`${API}/requests/${id}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load request.');
        setRequest(data.request);
      })
      .catch((loadError) => setError(loadError.message));
  }, [id]);

  return (
    <DashboardLayout user={user} title="Request details">
      <section className="card">
        <Link to="/requests">← Back to requests</Link>
        {error ? <div className="error-box">{error}</div> : null}
        {!request && !error ? <p className="muted">Loading request…</p> : null}
        {request ? (
          <>
            <div className="request-title-row">
              <div>
                <h2>{request.subject}</h2>
                <p className="muted">{request.request_number} · {request.requestType?.name} · {request.department?.department_name}</p>
              </div>
              {getStatusBadge(request.status)}
            </div>
            <div className="detail-grid">
              <div><strong>Submitted by</strong><span>{request.user?.name} · {request.student?.roll_number}</span></div>
              <div><strong>Faculty recipient</strong><span>{request.assignedFaculty?.name || 'Not assigned'}</span></div>
              <div><strong>Current reviewer</strong><span>{request.currentApprover?.name || 'Review complete'}</span></div>
              <div><strong>Submitted on</strong><span>{new Date(request.created_at).toLocaleString()}</span></div>
              <div><strong>Request details</strong><span>{request.description}</span></div>
              <div><strong>Reason</strong><span>{request.reason}</span></div>
            </div>
            {request.documents?.length ? (
              <div className="details-block">
                <h3>Supporting documents</h3>
                {request.documents.map((document) => <a key={document.id} href={document.file_path} target="_blank" rel="noreferrer">{document.original_name}</a>)}
              </div>
            ) : null}
            <div className="details-block">
              <h3>Review history</h3>
              {request.history?.length ? request.history.map((item) => (
                <div className="history-item" key={item.id}>
                  <span className="history-dot" />
                  <div><strong>{item.stage}: {item.action}</strong><small>{new Date(item.created_at).toLocaleString()}</small>{item.remarks ? <p>{item.remarks}</p> : null}</div>
                </div>
              )) : <p className="muted">No review actions have been recorded yet.</p>}
            </div>
            <a className="primary-btn inline-button" href={`${API}/requests/${request.id}/pdf`} target="_blank" rel="noreferrer">Download letter PDF</a>
          </>
        ) : null}
      </section>
    </DashboardLayout>
  );
}

function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('permission-user') || 'null');

  useEffect(() => {
    fetch(`${API}/profile`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load profile.');
        setProfile(data.profile);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  return (
    <DashboardLayout user={user} title="My profile">
      <section className="card profile-card">
        <h3>Account information</h3>
        {error ? <div className="error-box">{error}</div> : null}
        {profile ? (
          <div className="detail-grid">
            <div><strong>Name</strong><span>{profile.user.name}</span></div>
            <div><strong>Email</strong><span>{profile.user.email}</span></div>
            <div><strong>Role</strong><span>{profile.user.role}</span></div>
            <div><strong>Department</strong><span>{profile.department?.department_name || 'Institution-wide'}</span></div>
            {profile.student ? <>
              <div><strong>Roll number</strong><span>{profile.student.roll_number}</span></div>
              <div><strong>Year and section</strong><span>{profile.student.year} · {profile.student.section}</span></div>
            </> : null}
          </div>
        ) : !error ? <p className="muted">Loading profile…</p> : null}
      </section>
    </DashboardLayout>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ProtectedRoute({ user, role, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={getDashboardRoute(user.role)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useUserSession();

  if (loading) return <div className="load-screen">Loading...</div>;

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? getDashboardRoute(user.role) : '/login'} replace />} />
      <Route path="/login" element={user ? <Navigate to={getDashboardRoute(user.role)} replace /> : <LoginPage />} />
      <Route path="/developer/login" element={user ? <Navigate to={getDashboardRoute(user.role)} replace /> : <DeveloperLoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/student-dashboard" element={<ProtectedRoute user={user} role="STUDENT"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/faculty-dashboard" element={<ProtectedRoute user={user} role="FACULTY"><FacultyDashboard /></ProtectedRoute>} />
      <Route path="/hod-dashboard" element={<ProtectedRoute user={user} role="HOD"><HodDashboard /></ProtectedRoute>} />
      <Route path="/principal-dashboard" element={<ProtectedRoute user={user} role="PRINCIPAL"><PrincipalDashboard /></ProtectedRoute>} />
      <Route path="/developer-dashboard" element={<ProtectedRoute user={user} role="DEVELOPER"><DeveloperDashboard /></ProtectedRoute>} />
      <Route path="/requests" element={<ProtectedRoute user={user}><RequestsPage /></ProtectedRoute>} />
      <Route path="/requests/:id" element={<ProtectedRoute user={user}><RequestDetailsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute user={user}><ProfilePage /></ProtectedRoute>} />
    </Routes>
  );
}
