
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const TOKEN_KEY = "clinicqueue_token";
const LEGACY_TOKEN_KEY = "cliniqueue_token";
const LOGIN_ROLES = [
  {
    id: "patient",
    title: "Patient",
    description: "Book appointments and follow your visit status.",
    icon: "♙",
  },
  {
    id: "receptionist",
    title: "Receptionist",
    description: "Register patients, confirm arrivals, and manage the queue.",
    icon: "▤",
  },
  {
    id: "administrator",
    title: "Administrator",
    description: "Monitor clinic activity and manage records.",
    icon: "⚙",
  },
  {
    id: "medical_staff",
    title: "Medical staff",
    description: "View assigned patients and manage consultations.",
    icon: "✚",
  },
];

function roleLabel(role) {
  return (
    LOGIN_ROLES.find((option) => option.id === role)?.title ||
    "another role"
  );
}

function getStoredToken() {
  const token =
    localStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(LEGACY_TOKEN_KEY);

  if (token && !localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  return token;
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

function getErrorMessage(error) {
  const validationErrors = error.response?.data?.errors;

  if (validationErrors) {
    return Object.values(validationErrors).flat().join(" ");
  }

  return (
    error.response?.data?.message ||
    "Something went wrong. Please check your connection and try again."
  );
}

function Status({ value }) {
  const status = value || "pending";

  return (
    <span className={`status status-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="record-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="record-modal-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [authMode, setAuthMode] = useState("login");
  const [authStage, setAuthStage] = useState("role");
  const [selectedRole, setSelectedRole] = useState("");

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
  });

  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const role = String(user?.role || "").toLowerCase();
  const canSeeQueue = [
    "administrator",
    "receptionist",
    "medical_staff",
  ].includes(role);
  const canManagePatients = ["administrator", "receptionist"].includes(role);
  const canManageStaff = role === "administrator";
  const canViewConsultations = [
    "administrator",
    "medical_staff",
  ].includes(role);

  const loadUser = useCallback(async () => {
    const token = getStoredToken();

    if (!token) {
      setUser(null);
      setChecking(false);
      return;
    }

    try {
      const response = await api.get("/me");
      const currentUser =
        response.data.user ??
        response.data.data ??
        response.data;

      setUser(currentUser);
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        localStorage.removeItem("clinicqueue_token");
        localStorage.removeItem(LEGACY_TOKEN_KEY);
      } else {
        setAuthError(getErrorMessage(requestError));
      }
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  function handleAuthChange(event) {
    setAuthForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const endpoint =
        authMode === "login" ? "/login" : "/register";

      const payload =
        authMode === "login"
          ? {
              email: authForm.email,
              password: authForm.password,
            }
          : authForm;

      const response = await api.post(endpoint, payload);
      const data = response.data;

      const token =
        data.token ??
        data.access_token ??
        data.data?.token ??
        data.data?.access_token;

      if (!token) {
        setAuthError(
          data.message ||
            "The server did not return an authentication token. Check your Laravel AuthController."
        );
        return;
      }

      let currentUser =
        data.user ??
        data.data?.user ??
        data.data?.data?.user;

      if (!currentUser) {
        const userResponse = await axios.get(
          `${api.defaults.baseURL}/me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        currentUser =
          userResponse.data.user ??
          userResponse.data.data ??
          userResponse.data;
      }

      if (currentUser.role !== selectedRole) {
        let logoutError = "";

        try {
          await axios.post(
            `${api.defaults.baseURL}/logout`,
            {},
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
        } catch (requestError) {
          logoutError = ` The temporary session could not be revoked: ${getErrorMessage(requestError)}`;
        }

        setAuthError(
          `This account is registered as ${roleLabel(
            currentUser.role
          )}. Choose that role to sign in.${logoutError}`
        );
        return;
      }

      localStorage.setItem(TOKEN_KEY, token);
      setUser(currentUser);
      setPage("dashboard");
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.post("/logout");
    } catch {
      // Clear local session even if the request fails.
    }

    localStorage.removeItem("clinicqueue_token");
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    setUser(null);
    setPage("dashboard");
    setAuthStage("role");
    setSelectedRole("");
    setAuthMode("login");

    setAuthForm({
      name: "",
      email: "",
      password: "",
      password_confirmation: "",
    });
  }

  if (checking) {
    return (
      <div className="loading-screen">
        <h2>ClinicQueue</h2>
        <p>Loading your clinic workspace...</p>
      </div>
    );
  }

  if (!user) {
    const selectedRoleInfo = LOGIN_ROLES.find(
      (option) => option.id === selectedRole
    );

    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-icon">+</div>
          <p className="eyebrow">SCHOOL CLINIC SYSTEM</p>
          <h1>ClinicQueue</h1>

          <p className="muted">
            {authStage === "role"
              ? "Choose your account type to continue."
              : `Sign in to your ${selectedRoleInfo?.title.toLowerCase()} workspace.`}
          </p>

          <div className="auth-steps" aria-label="Sign-in steps">
            <span className={authStage === "role" ? "current" : "complete"}>1</span>
            <div />
            <span className={authStage === "login" ? "current" : ""}>2</span>
          </div>

          {authStage === "role" ? (
            <div className="role-picker">
              {LOGIN_ROLES.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={
                    selectedRole === option.id
                      ? "role-choice selected"
                      : "role-choice"
                  }
                  aria-pressed={selectedRole === option.id}
                  onClick={() => {
                    setSelectedRole(option.id);
                    setAuthError("");
                  }}
                >
                  <span className="role-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="role-copy">
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="role-arrow" aria-hidden="true">›</span>
                </button>
              ))}

              {authError && <div className="alert">{authError}</div>}

              <button
                type="button"
                className="primary full-width"
                disabled={!selectedRole}
                onClick={() => {
                  setAuthMode("login");
                  setAuthStage("login");
                  setAuthError("");
                }}
              >
                Continue to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="selected-role">
                <span className="role-icon" aria-hidden="true">
                  {selectedRoleInfo?.icon}
                </span>
                <span>
                  <small>Signing in as</small>
                  <strong>{selectedRoleInfo?.title}</strong>
                </span>
                <button
                  type="button"
                  className="change-role"
                  onClick={() => {
                    setAuthStage("role");
                    setAuthError("");
                  }}
                >
                  Change
                </button>
              </div>

              {selectedRole === "patient" && (
                <div className="auth-tabs">
                  <button
                    type="button"
                    className={authMode === "login" ? "active" : ""}
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                    }}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    className={authMode === "register" ? "active" : ""}
                    onClick={() => {
                      setAuthMode("register");
                      setAuthError("");
                    }}
                  >
                    Register
                  </button>
                </div>
              )}

              {authError && <div className="alert">{authError}</div>}

              <form
                onSubmit={handleAuthSubmit}
                className="auth-form"
              >
                {authMode === "register" && selectedRole === "patient" && (
                  <div>
                    <label htmlFor="name">Full name</label>
                    <input
                      id="name"
                      name="name"
                      value={authForm.name}
                      onChange={handleAuthChange}
                      placeholder="Enter your full name"
                      autoComplete="name"
                      required
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={authForm.email}
                    onChange={handleAuthChange}
                    placeholder="you@example.com"
                    autoComplete="username"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={authForm.password}
                    onChange={handleAuthChange}
                    placeholder="Enter your password"
                    autoComplete={
                      authMode === "register" ? "new-password" : "current-password"
                    }
                    required
                  />
                </div>

                {authMode === "register" && selectedRole === "patient" && (
                  <div>
                    <label htmlFor="password_confirmation">
                      Confirm password
                    </label>
                    <input
                      id="password_confirmation"
                      name="password_confirmation"
                      type="password"
                      value={authForm.password_confirmation}
                      onChange={handleAuthChange}
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                )}

                <button
                  className="primary full-width"
                  type="submit"
                  disabled={authLoading}
                >
                  {authLoading
                    ? "Please wait..."
                    : authMode === "login"
                      ? "Sign in"
                      : "Create patient account"}
                </button>
              </form>
            </>
          )}

          <p className="auth-footer">
            School Clinic Appointment and Queue Management
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">+</div>
          <div>
            <h2>ClinicQueue</h2>
            <small>School Clinic</small>
          </div>
        </div>

        <p className="sidebar-label">WORKSPACE</p>

        <nav className="sidebar-nav">
          <button
            className={
              page === "dashboard"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => setPage("dashboard")}
          >
            <span>▦</span> Dashboard
          </button>

          <button
            className={
              page === "appointments"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => setPage("appointments")}
          >
            <span>▣</span> Appointments
          </button>
          {canSeeQueue && (
            <button
              className={page === "queue" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("queue")}
            >
              <span>◷</span> Today’s queue
            </button>
          )}
          {canManagePatients && (
            <button
              className={page === "patients" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("patients")}
            >
              <span>♙</span> Patients
            </button>
          )}
          {canManageStaff && (
            <button
              className={page === "staff" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("staff")}
            >
              <span>♟</span> Staff
            </button>
          )}
          {canViewConsultations && (
            <button
              className={
                page === "consultations" ? "nav-item active" : "nav-item"
              }
              onClick={() => setPage("consultations")}
            >
              <span>✚</span> Consultations
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-summary">
            <div className="avatar">
              {(user.name || user.full_name || "U")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="user-details">
              <strong>
                {user.name || user.full_name || user.email}
              </strong>
              <small>{user.role || "User"}</small>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            ↪ Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SCHOOL CLINIC</p>
            <h2>
              {page === "dashboard"
                ? "Dashboard"
                : page === "queue"
                  ? "Today’s queue"
                  : page === "patients"
                    ? "Patients"
                    : page === "staff"
                      ? "Staff"
                      : page === "consultations"
                        ? "Consultations"
                        : "Appointments"}
            </h2>
          </div>

          <div className="topbar-user">
            <span className="online-dot" />
            {user.name || user.full_name || user.email}
          </div>
        </header>

        {page === "dashboard" ? (
          <Dashboard
            user={user}
            onAppointments={() => setPage("appointments")}
          />
        ) : page === "queue" ? (
          <Queue user={user} />
        ) : page === "patients" && canManagePatients ? (
          <Patients user={user} />
        ) : page === "staff" && canManageStaff ? (
          <StaffManagement />
        ) : page === "consultations" && canViewConsultations ? (
          <Consultations user={user} />
        ) : (
          <Appointments user={user} />
        )}
      </main>
    </div>
  );
}

function Dashboard({ user, onAppointments }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    api
      .get("/dashboard")
      .then((response) => {
        if (active) {
          setStats(response.data.data ?? response.data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getErrorMessage(requestError));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <section className="welcome-panel">
        <div>
          <p className="eyebrow">YOUR CLINIC WORKSPACE</p>

          <h1>
            Welcome back, {user.name || user.full_name || "User"}!
          </h1>

          <p>
            Manage clinic appointments and keep track of your visits.
          </p>

          <button
            className="primary"
            onClick={onAppointments}
          >
            View appointments →
          </button>
        </div>

        <div className="welcome-symbol">✚</div>
      </section>

      {error && (
        <div className="alert">
          Dashboard statistics could not be loaded. You can still
          manage appointments. {error}
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          label="Total appointments"
          value={
            stats?.total_appointments ??
            stats?.appointments_count ??
            "—"
          }
          symbol="▣"
        />

        <StatCard
          label="Pending"
          value={
            stats?.pending_appointments ??
            stats?.pending_count ??
            "—"
          }
          symbol="◷"
        />

        <StatCard
          label="Waiting today"
          value={
            stats?.waiting_patients ??
            "—"
          }
          symbol="◷"
        />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Quick actions</h2>
            <p className="muted">
              Choose what you would like to do next.
            </p>
          </div>
        </div>

        <div className="quick-actions">
          <button
            className="quick-action"
            onClick={onAppointments}
          >
            <span className="quick-icon">＋</span>
            <strong>Appointments</strong>
            <small>Book or review clinic visits</small>
          </button>

          <button
            className="quick-action"
            onClick={onAppointments}
          >
            <span className="quick-icon">◷</span>
            <strong>Appointment status</strong>
            <small>Check pending and approved visits</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, symbol }) {
  return (
    <section className="stat-card">
      <div className="stat-symbol">{symbol}</div>
      <p>{label}</p>
      <h2>{value}</h2>
    </section>
  );
}

function Appointments({ user }) {
  const [items, setItems] = useState([]);
  const [patients, setPatients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [editAppointment, setEditAppointment] = useState(null);
  const [editForm, setEditForm] = useState({
    patient_id: "",
    staff_profile_id: "",
    date: "",
    time: "",
    reason: "",
  });

  const isStaff = ["administrator", "receptionist"].includes(
    String(user.role || "").toLowerCase()
  );
  const isPatient = String(user.role || "").toLowerCase() === "patient";
  const [minimumDate] = useState(() => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().slice(0, 10);
  });

  const [form, setForm] = useState({
    patient_id: "",
    staff_profile_id: "",
    appointment_date: "",
    appointment_time: "09:00",
    reason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const appointmentResponse = await api.get("/appointments");

      const appointmentData =
        appointmentResponse.data.data ??
        appointmentResponse.data;

      setItems(
        Array.isArray(appointmentData) ? appointmentData : []
      );

      if (isStaff) {
        const [patientResponse, staffResponse] = await Promise.all([
          api.get("/patients", { params: { per_page: 100 } }),
          api.get("/staff", { params: { available: true, per_page: 100 } }),
        ]);

        const patientData =
          patientResponse.data.data ??
          patientResponse.data;
        const staffData = staffResponse.data.data ?? staffResponse.data;

        setPatients(
          Array.isArray(patientData) ? patientData : []
        );
        setStaff(Array.isArray(staffData) ? staffData : []);
      }

      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    load();
  }, [load]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function openEditAppointment(item) {
    setEditAppointment(item);
    setEditForm({
      patient_id: String(item.patient_id ?? ""),
      staff_profile_id: String(item.staff_profile_id ?? ""),
      date: appointmentDate(item),
      time: appointmentTime(item),
      reason: item.reason || "",
    });
    setError("");
  }

  async function saveAppointmentEdit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    const payload = {
      date: editForm.date,
      time: editForm.time,
      reason: editForm.reason.trim(),
    };

    if (isStaff) {
      payload.patient_id = Number(editForm.patient_id);
      payload.staff_profile_id = editForm.staff_profile_id
        ? Number(editForm.staff_profile_id)
        : null;
    }

    try {
      await api.patch(`/appointments/${editAppointment.id}`, payload);
      setEditAppointment(null);
      setMessage("Appointment updated.");
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.appointment_date) {
      setError("Please select an appointment date.");
      return;
    }

    if (!form.appointment_time) {
      setError("Please select an appointment time.");
      return;
    }

    if (!form.reason.trim()) {
      setError("Please enter the reason for your visit.");
      return;
    }

    if (isStaff && !form.patient_id) {
      setError("Please select a patient.");
      return;
    }

    const payload = {
      date: form.appointment_date,
      time: form.appointment_time,
      reason: form.reason.trim(),
      status: "pending",
    };

    // Staff select a patient from the database.
    // Patient accounts are linked to their patient ID by Laravel.
    if (isStaff) {
      payload.patient_id = Number(form.patient_id);
      if (form.staff_profile_id) {
        payload.staff_profile_id = Number(form.staff_profile_id);
      }
    }

    setSaving(true);

    try {
      const response = await api.post("/appointments", payload);

      setMessage(
        response.data.message ||
          "Appointment created successfully!"
      );

      setForm({
        patient_id: "",
        staff_profile_id: "",
        appointment_date: "",
        appointment_time: "09:00",
        reason: "",
      });

      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id, status) {
    setError("");
    setMessage("");

    try {
      await api.patch(`/appointments/${id}`, { status });

      setMessage(`Appointment ${status}.`);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function cancelAppointment(id) {
    if (!window.confirm("Delete this appointment?")) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await api.delete(`/appointments/${id}`);

      setMessage("Appointment deleted.");
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  const filtered = items.filter((item) => {
    const name =
      item.patient?.full_name ||
      item.patient?.name ||
      "";

    const patientId = String(
      item.patient_id ?? item.patient?.id ?? ""
    );

    const patientNumber = item.patient?.patient_number || "";
    const reason = item.reason || "";
    const query = search.toLowerCase();

    return (
      name.toLowerCase().includes(query) ||
      patientId.includes(query) ||
      patientNumber.toLowerCase().includes(query) ||
      reason.toLowerCase().includes(query)
    );
  });

  function appointmentDate(item) {
    return String(
      item.date ?? item.appointment_date ?? ""
    ).slice(0, 10);
  }

  function appointmentTime(item) {
    return String(
      item.time ?? item.appointment_time ?? ""
    ).slice(0, 5);
  }

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <p className="eyebrow">SCHEDULING</p>
          <h1>Appointments</h1>
          <p className="muted">
            Book, view, and manage clinic appointments.
          </p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      {(isStaff || isPatient) && <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Book an appointment</h2>
            <p className="muted">
              Complete the appointment details.
            </p>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="form-grid">
            {isStaff && (
              <div className="span-2">
                <label htmlFor="patient_id">
                  Patient ID / Patient
                </label>

                <select
                  id="patient_id"
                  name="patient_id"
                  value={form.patient_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">
                    Select a patient
                  </option>

                  {patients.map((patient) => (
                    <option
                      key={patient.id}
                      value={patient.id}
                    >
                      ID: {patient.id} —{" "}
                      {patient.full_name ||
                        patient.name ||
                        patient.email ||
                        "Patient"}
                      {patient.patient_number
                        ? ` (${patient.patient_number})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isStaff && (
              <div className="span-2">
                <label htmlFor="staff_profile_id">Assigned medical staff</label>
                <select
                  id="staff_profile_id"
                  name="staff_profile_id"
                  value={form.staff_profile_id}
                  onChange={handleChange}
                >
                  <option value="">Unassigned</option>
                  {staff.filter((profile) => profile.user?.role === "medical_staff").map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.user?.name || "Medical staff"}
                      {profile.specialization
                        ? ` — ${profile.specialization}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isPatient && (
              <div className="span-2">
                <label>Patient ID</label>
                <p className="muted">
                  Your patient ID will be assigned automatically
                  using your linked clinic patient profile.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="appointment_date">
                Date
              </label>

              <input
                id="appointment_date"
                name="appointment_date"
                type="date"
                min={minimumDate}
                value={form.appointment_date}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label htmlFor="appointment_time">
                Time
              </label>

              <input
                id="appointment_time"
                name="appointment_time"
                type="time"
                value={form.appointment_time}
                onChange={handleChange}
                required
              />
            </div>

            <div className="span-2">
              <label htmlFor="reason">
                Reason for visit
              </label>

              <textarea
                id="reason"
                name="reason"
                value={form.reason}
                onChange={handleChange}
                maxLength={1000}
                placeholder="Briefly describe your visit"
                rows={3}
                required
              />
            </div>
          </div>

          <button
            className="primary"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving..."
              : "＋ Create appointment"}
          </button>
        </form>
      </section>}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Appointment records</h2>
            <p className="muted">
              {filtered.length} record(s) shown.
            </p>
          </div>

          <input
            className="search-input"
            placeholder="Search patient, ID, or reason..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <p className="empty">
            Loading appointments...
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Patient</th>
                  <th>Assigned staff</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.patient_id ??
                        item.patient?.id ??
                        "—"}
                    </td>

                    <td>
                      {item.patient?.full_name ||
                        item.patient?.name ||
                        "—"}
                    </td>
                    <td>
                      {item.staff_profile?.user?.name || "Unassigned"}
                    </td>

                    <td>
                      {appointmentDate(item) || "—"}
                    </td>

                    <td>
                      {appointmentTime(item) || "—"}
                    </td>

                    <td>{item.reason || "—"}</td>

                    <td>
                      <Status value={item.status} />
                    </td>

                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => setSelectedAppointment(item)}
                        >
                          View
                        </button>

                        {(isPatient && item.status === "pending" ||
                          isStaff &&
                            ["pending", "approved", "rescheduled"].includes(item.status) &&
                            !item.queue_record) && (
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => openEditAppointment(item)}
                            >
                              Edit
                            </button>
                          )}

                        {isStaff &&
                          item.status === "pending" && (
                            <button
                              type="button"
                              className="text-action"
                              onClick={() =>
                                changeStatus(
                                  item.id,
                                  "approved"
                                )
                              }
                            >
                              Approve
                            </button>
                          )}

                        {isStaff &&
                          item.status === "approved" && (
                            <button
                              type="button"
                              className="text-action"
                              onClick={async () => {
                                setError("");
                                setMessage("");

                                try {
                                  await api.post(
                                    `/appointments/${item.id}/arrive`
                                  );
                                  setMessage("Patient checked in to today’s queue.");
                                  await load();
                                } catch (requestError) {
                                  setError(getErrorMessage(requestError));
                                }
                              }}
                            >
                              Check in
                            </button>
                          )}

                        {isStaff &&
                          item.status === "pending" && (
                            <button
                              type="button"
                              className="text-action danger-text"
                              onClick={() =>
                                cancelAppointment(item.id)
                              }
                            >
                              Delete
                            </button>
                          )}

                        {isPatient && item.status === "pending" && (
                          <button
                            type="button"
                            className="text-action danger-text"
                            onClick={() => changeStatus(item.id, "cancelled")}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filtered.length && (
              <p className="empty">
                No appointments found.
              </p>
            )}
          </div>
        )}
      </section>

      {selectedAppointment && (
        <Modal
          title={`Appointment #${selectedAppointment.id}`}
          onClose={() => setSelectedAppointment(null)}
        >
          <dl className="record-details">
            <div><dt>Patient</dt><dd>{selectedAppointment.patient?.full_name || "—"}</dd></div>
            <div><dt>Patient number</dt><dd>{selectedAppointment.patient?.patient_number || "—"}</dd></div>
            <div><dt>Assigned staff</dt><dd>{selectedAppointment.staff_profile?.user?.name || "Unassigned"}</dd></div>
            <div><dt>Date and time</dt><dd>{appointmentDate(selectedAppointment)} at {appointmentTime(selectedAppointment)}</dd></div>
            <div><dt>Status</dt><dd><Status value={selectedAppointment.status} /></dd></div>
            <div><dt>Reason</dt><dd>{selectedAppointment.reason || "—"}</dd></div>
            {selectedAppointment.queue_record && (
              <div><dt>Queue number</dt><dd>{selectedAppointment.queue_record.queue_number}</dd></div>
            )}
          </dl>
        </Modal>
      )}

      {editAppointment && (
        <Modal
          title={`Edit appointment #${editAppointment.id}`}
          onClose={() => setEditAppointment(null)}
        >
          <form className="auth-form" onSubmit={saveAppointmentEdit}>
            {isStaff && (
              <>
                <div>
                  <label htmlFor="edit-appointment-patient">Patient</label>
                  <select
                    id="edit-appointment-patient"
                    value={editForm.patient_id}
                    onChange={(event) =>
                      setEditForm((previous) => ({
                        ...previous,
                        patient_id: event.target.value,
                      }))
                    }
                    required
                  >
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.full_name} ({patient.patient_number})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-appointment-staff">Assigned staff</label>
                  <select
                    id="edit-appointment-staff"
                    value={editForm.staff_profile_id}
                    onChange={(event) =>
                      setEditForm((previous) => ({
                        ...previous,
                        staff_profile_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {staff.filter((profile) => profile.user?.role === "medical_staff").map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.user?.name || "Medical staff"}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label htmlFor="edit-appointment-date">Date</label>
              <input
                id="edit-appointment-date"
                type="date"
                min={minimumDate}
                value={editForm.date}
                onChange={(event) =>
                  setEditForm((previous) => ({
                    ...previous,
                    date: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label htmlFor="edit-appointment-time">Time</label>
              <input
                id="edit-appointment-time"
                type="time"
                value={editForm.time}
                onChange={(event) =>
                  setEditForm((previous) => ({
                    ...previous,
                    time: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label htmlFor="edit-appointment-reason">Reason</label>
              <textarea
                id="edit-appointment-reason"
                value={editForm.reason}
                onChange={(event) =>
                  setEditForm((previous) => ({
                    ...previous,
                    reason: event.target.value,
                  }))
                }
                maxLength={1000}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditAppointment(null)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
  });
  const [editingStaff, setEditingStaff] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
    role: "medical_staff",
    staff_number: "",
    specialization: "",
    availability_status: true,
  });

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.get("/staff", {
        params: {
          page,
          ...(appliedSearch ? { search: appliedSearch } : {}),
        },
      });
      setStaff(Array.isArray(response.data.data) ? response.data.data : []);
      setPagination({
        current_page: response.data.current_page || 1,
        last_page: response.data.last_page || 1,
        total: response.data.total || 0,
      });
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm({
      name: "",
      email: "",
      password: "",
      password_confirmation: "",
      role: "medical_staff",
      staff_number: "",
      specialization: "",
      availability_status: true,
    });
    setEditingStaff(null);
  }

  function editRecord(profile) {
    setEditingStaff(profile);
    setForm({
      name: profile.user?.name || "",
      email: profile.user?.email || "",
      password: "",
      password_confirmation: "",
      role: profile.user?.role || "medical_staff",
      staff_number: profile.staff_number || "",
      specialization: profile.specialization || "",
      availability_status: Boolean(profile.availability_status),
    });
  }

  async function saveStaff(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      staff_number: form.staff_number.trim(),
      specialization: form.specialization.trim() || null,
      availability_status: form.availability_status,
    };
    if (form.password) {
      payload.password = form.password;
      payload.password_confirmation = form.password_confirmation;
    }

    try {
      if (editingStaff) {
        await api.patch(`/staff/${editingStaff.id}`, payload);
        setMessage("Staff account updated.");
      } else {
        payload.password = form.password;
        payload.password_confirmation = form.password_confirmation;
        await api.post("/staff", payload);
        setMessage("Staff account created.");
      }
      resetForm();
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function viewStaff(profile) {
    try {
      const response = await api.get(`/staff/${profile.id}`);
      setSelectedStaff(response.data.staff ?? response.data);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function deleteStaff(profile) {
    if (!window.confirm(`Delete the staff account for ${profile.user?.name}?`)) {
      return;
    }

    setError("");
    setMessage("");
    try {
      const response = await api.delete(`/staff/${profile.id}`);
      setMessage(response.data.message || "Staff account deleted.");
      setSelectedStaff(null);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <p className="eyebrow">CLINIC TEAM</p>
          <h1>Staff accounts</h1>
          <p className="muted">Create and manage receptionist and medical staff accounts.</p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingStaff ? "Edit staff account" : "Add staff account"}</h2>
            <p className="muted">
              {editingStaff ? "Update the account and staff profile." : "Create an account for a clinic team member."}
            </p>
          </div>
          {editingStaff && (
            <button type="button" className="secondary" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={saveStaff}>
          <div className="form-grid">
            <div>
              <label htmlFor="staff-name">Full name</label>
              <input id="staff-name" value={form.name} maxLength={255}
                onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
            <div>
              <label htmlFor="staff-email">Email</label>
              <input id="staff-email" type="email" autoComplete="username"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </div>
            <div>
              <label htmlFor="staff-role">Role</label>
              <select id="staff-role" value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="receptionist">Receptionist</option>
                <option value="medical_staff">Medical staff</option>
              </select>
            </div>
            <div>
              <label htmlFor="staff-number">Staff number</label>
              <input id="staff-number" value={form.staff_number} maxLength={50}
                onChange={(event) => setForm({ ...form, staff_number: event.target.value })} required />
            </div>
            <div>
              <label htmlFor="staff-specialization">Specialization</label>
              <input id="staff-specialization" value={form.specialization} maxLength={255}
                onChange={(event) => setForm({ ...form, specialization: event.target.value })} />
            </div>
            <div className="checkbox-field">
              <input id="staff-available" type="checkbox" checked={form.availability_status}
                onChange={(event) => setForm({ ...form, availability_status: event.target.checked })} />
              <label htmlFor="staff-available">Available for appointment assignment</label>
            </div>
            <div>
              <label htmlFor="staff-password">{editingStaff ? "New password (optional)" : "Password"}</label>
              <input id="staff-password" type="password" minLength={8}
                autoComplete="new-password" value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required={!editingStaff} />
            </div>
            <div>
              <label htmlFor="staff-password-confirmation">Confirm password</label>
              <input id="staff-password-confirmation" type="password" minLength={8}
                autoComplete="new-password" value={form.password_confirmation}
                onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })}
                required={!editingStaff || Boolean(form.password)} />
            </div>
          </div>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : editingStaff ? "Save staff changes" : "Create staff account"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Staff directory</h2>
            <p className="muted">{pagination.total} staff profile(s).</p>
          </div>
          <form className="search-form" onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
            setPage(1);
          }}>
            <input className="search-input" value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, staff number, or specialty..." />
            <button className="secondary" type="submit">Search</button>
          </form>
        </div>
        {loading ? <p className="empty">Loading staff records...</p> : staff.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Staff number</th><th>Name</th><th>Email</th><th>Role</th><th>Specialization</th><th>Availability</th><th>Actions</th></tr></thead>
              <tbody>
                {staff.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.staff_number}</td>
                    <td>{profile.user?.name || "—"}</td>
                    <td>{profile.user?.email || "—"}</td>
                    <td>{roleLabel(profile.user?.role)}</td>
                    <td>{profile.specialization || "—"}</td>
                    <td><Status value={profile.availability_status ? "available" : "unavailable"} /></td>
                    <td><div className="actions">
                      <button type="button" className="text-action" onClick={() => viewStaff(profile)}>View</button>
                      <button type="button" className="text-action" onClick={() => editRecord(profile)}>Edit</button>
                      <button type="button" className="text-action danger-text" onClick={() => deleteStaff(profile)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No staff accounts found.</p>}
        {pagination.last_page > 1 && (
          <div className="pagination">
            <button className="secondary" type="button" disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {pagination.current_page} of {pagination.last_page}</span>
            <button className="secondary" type="button" disabled={page >= pagination.last_page || loading}
              onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        )}
      </section>

      {selectedStaff && (
        <Modal title={`Staff ${selectedStaff.staff_number}`} onClose={() => setSelectedStaff(null)}>
          <dl className="record-details">
            <div><dt>Name</dt><dd>{selectedStaff.user?.name}</dd></div>
            <div><dt>Email</dt><dd>{selectedStaff.user?.email}</dd></div>
            <div><dt>Role</dt><dd>{roleLabel(selectedStaff.user?.role)}</dd></div>
            <div><dt>Specialization</dt><dd>{selectedStaff.specialization || "—"}</dd></div>
            <div><dt>Availability</dt><dd>{selectedStaff.availability_status ? "Available" : "Unavailable"}</dd></div>
          </dl>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setSelectedStaff(null)}>Close</button>
            <button type="button" className="danger-button" onClick={() => deleteStaff(selectedStaff)}>Delete account</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Patients() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [name, setName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [editingPatient, setEditingPatient] = useState(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    contact_number: "",
  });
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
  });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.get("/patients", {
        params: {
          page,
          ...(appliedSearch ? { search: appliedSearch } : {}),
        },
      });
      setPatients(Array.isArray(response.data.data) ? response.data.data : []);
      setPagination({
        current_page: response.data.current_page || 1,
        last_page: response.data.last_page || 1,
        total: response.data.total || 0,
      });
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPatient(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const response = await api.post("/patients", {
        full_name: name.trim(),
        contact_number: contactNumber.trim() || null,
      });
      setMessage(response.data.message || "Patient registered.");
      setPatients((previous) => [
        response.data.patient,
        ...previous.filter(
          (patient) => patient.id !== response.data.patient.id
        ),
      ]);
      setName("");
      setContactNumber("");
      setAppliedSearch("");
      setSearch("");
      setPage(1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function viewPatient(patient) {
      setError("");

      try {
        const response = await api.get(`/patients/${patient.id}`);
        setSelectedPatient(response.data.patient ?? response.data);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      }
  }

  function startPatientEdit(patient) {
      setEditingPatient(patient);
      setEditForm({
        full_name: patient.full_name || "",
        contact_number: patient.contact_number || "",
      });
  }

  async function updatePatient(event) {
      event.preventDefault();
      setError("");
      setMessage("");
      setSaving(true);

      try {
        await api.patch(`/patients/${editingPatient.id}`, {
          full_name: editForm.full_name.trim(),
          contact_number: editForm.contact_number.trim() || null,
        });
        setEditingPatient(null);
        setMessage("Patient record updated.");
        await load();
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setSaving(false);
      }
  }

  async function deletePatient(patient) {
      if (!window.confirm(`Delete patient record for ${patient.full_name}?`)) {
        return;
      }

      setError("");
      setMessage("");

      try {
        const response = await api.delete(`/patients/${patient.id}`);
        setMessage(response.data.message || "Patient record deleted.");
        setSelectedPatient(null);
        await load();
      } catch (requestError) {
        setError(getErrorMessage(requestError));
    }
  }

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <p className="eyebrow">PATIENT RECORDS</p>
          <h1>Patients</h1>
          <p className="muted">
            Register patients and find their clinic records.
          </p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Register a patient</h2>
            <p className="muted">
              A clinic patient number will be assigned automatically.
            </p>
          </div>
        </div>
        <form onSubmit={addPatient}>
          <div className="form-grid">
            <div>
              <label htmlFor="patient-name">Full name</label>
              <input
                id="patient-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
                required
              />
            </div>
            <div>
              <label htmlFor="patient-contact">Contact number</label>
              <input
                id="patient-contact"
                value={contactNumber}
                onChange={(event) => setContactNumber(event.target.value)}
                maxLength={30}
                type="tel"
              />
            </div>
          </div>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Register patient"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Patient directory</h2>
            <p className="muted">{pagination.total} patient(s) in the directory.</p>
          </div>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(search.trim());
              setPage(1);
            }}
          >
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, number, or contact..."
              aria-label="Search patients"
            />
            <button className="secondary" type="submit">Search</button>
          </form>
        </div>

        {loading ? (
          <p className="empty">Loading patient records...</p>
        ) : patients.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient number</th>
                  <th>Full name</th>
                  <th>Contact number</th>
                  <th>Account email</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td>{patient.patient_number}</td>
                    <td>{patient.full_name}</td>
                    <td>{patient.contact_number || "—"}</td>
                    <td>{patient.user?.email || "No account linked"}</td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => viewPatient(patient)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => startPatientEdit(patient)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-action danger-text"
                          onClick={() => deletePatient(patient)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No patient records match this search.</p>
        )}
        {pagination.last_page > 1 && (
          <div className="pagination">
            <button
              type="button"
              className="secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span>Page {pagination.current_page} of {pagination.last_page}</span>
            <button
              type="button"
              className="secondary"
              disabled={page >= pagination.last_page || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>

      {selectedPatient && (
        <Modal
          title={`Patient ${selectedPatient.patient_number}`}
          onClose={() => setSelectedPatient(null)}
        >
          <dl className="record-details">
            <div><dt>Full name</dt><dd>{selectedPatient.full_name}</dd></div>
            <div><dt>Contact number</dt><dd>{selectedPatient.contact_number || "—"}</dd></div>
            <div><dt>Account email</dt><dd>{selectedPatient.user?.email || "No account linked"}</dd></div>
            <div><dt>Appointments</dt><dd>{selectedPatient.appointments?.length ?? 0}</dd></div>
          </dl>
        </Modal>
      )}

      {editingPatient && (
        <Modal
          title={`Edit patient ${editingPatient.patient_number}`}
          onClose={() => setEditingPatient(null)}
        >
          <form className="auth-form" onSubmit={updatePatient}>
            <div>
              <label htmlFor="edit-patient-name">Full name</label>
              <input
                id="edit-patient-name"
                value={editForm.full_name}
                maxLength={255}
                onChange={(event) =>
                  setEditForm((previous) => ({
                    ...previous,
                    full_name: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div>
              <label htmlFor="edit-patient-contact">Contact number</label>
              <input
                id="edit-patient-contact"
                type="tel"
                maxLength={30}
                value={editForm.contact_number}
                onChange={(event) =>
                  setEditForm((previous) => ({
                    ...previous,
                    contact_number: event.target.value,
                  }))
                }
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditingPatient(null)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Consultations({ user }) {
  const isAdmin = user.role === "administrator";
  const [records, setRecords] = useState([]);
  const [queues, setQueues] = useState([]);
  const [staff, setStaff] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    queue_record_id: "",
    staff_profile_id: "",
  });
  const [editForm, setEditForm] = useState({
    status: "",
    staff_profile_id: "",
    start_time: "",
    end_time: "",
  });

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [recordResponse, queueResponse, staffResponse] = await Promise.all([
        api.get("/consultations", { params: { page } }),
        api.get("/queue", { params: { status: "called" } }),
        isAdmin ? api.get("/staff") : Promise.resolve({ data: { data: [] } }),
      ]);
      setRecords(Array.isArray(recordResponse.data.data) ? recordResponse.data.data : []);
      setPagination({
        current_page: recordResponse.data.current_page || 1,
        last_page: recordResponse.data.last_page || 1,
        total: recordResponse.data.total || 0,
      });
      const queueData = queueResponse.data.data ?? queueResponse.data;
      setQueues(Array.isArray(queueData) ? queueData : []);
      const staffData = staffResponse.data.data ?? staffResponse.data;
      setStaff(Array.isArray(staffData) ? staffData : []);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function startConsultation(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    const payload = { queue_record_id: Number(form.queue_record_id) };
    if (isAdmin) {
      payload.staff_profile_id = Number(form.staff_profile_id);
    }

    try {
      const response = await api.post("/consultations", payload);
      setMessage(response.data.message || "Consultation started.");
      setForm({ queue_record_id: "", staff_profile_id: "" });
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function viewConsultation(record) {
    try {
      const response = await api.get(`/consultations/${record.id}`);
      setSelected(response.data.consultation ?? response.data);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  function editConsultation(record) {
    setEditing(record);
    setEditForm({
      status: record.status || "",
      staff_profile_id: String(record.staff_profile_id || ""),
      start_time: record.start_time
        ? String(record.start_time).slice(0, 16)
        : "",
      end_time: record.end_time
        ? String(record.end_time).slice(0, 16)
        : "",
    });
  }

  async function saveConsultation(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    const payload = { status: editForm.status };
    if (isAdmin) {
      payload.staff_profile_id = Number(editForm.staff_profile_id);
      payload.start_time = editForm.start_time || null;
      payload.end_time = editForm.end_time || null;
    }

    try {
      await api.patch(`/consultations/${editing.id}`, payload);
      setEditing(null);
      setMessage("Consultation record updated.");
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteConsultation(record) {
    if (!window.confirm("Delete this consultation record? This cannot be undone.")) {
      return;
    }

    setError("");
    setMessage("");
    try {
      const response = await api.delete(`/consultations/${record.id}`);
      setMessage(response.data.message || "Consultation record deleted.");
      setSelected(null);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <p className="eyebrow">PATIENT CARE</p>
          <h1>Consultations</h1>
          <p className="muted">Review and update consultation records and visit times.</p>
        </div>
        <button type="button" className="secondary" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>
      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Start consultation</h2>
            <p className="muted">Start a visit for a patient already called from today’s queue.</p>
          </div>
        </div>
        <form onSubmit={startConsultation}>
          <div className="form-grid">
            <div>
              <label htmlFor="consultation-queue">Called patient</label>
              <select id="consultation-queue" value={form.queue_record_id}
                onChange={(event) => setForm({ ...form, queue_record_id: event.target.value })} required>
                <option value="">Select a queue record</option>
                {queues.map((queue) => (
                  <option key={queue.id} value={queue.id}>
                    #{queue.queue_number} — {queue.appointment?.patient?.full_name || "Patient"}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div>
                <label htmlFor="consultation-staff">Medical staff</label>
                <select id="consultation-staff" value={form.staff_profile_id}
                  onChange={(event) => setForm({ ...form, staff_profile_id: event.target.value })} required>
                  <option value="">Assign medical staff</option>
                  {staff.filter((profile) => profile.user?.role === "medical_staff").map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.user?.name || profile.staff_number}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button className="primary" type="submit" disabled={saving || !queues.length}>
            {saving ? "Starting..." : "Start consultation"}
          </button>
          {!queues.length && <p className="muted form-note">No called patients are waiting to start consultation.</p>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Consultation records</h2>
            <p className="muted">{pagination.total} record(s).</p>
          </div>
        </div>
        {loading ? <p className="empty">Loading consultations...</p> : records.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Patient</th><th>Queue #</th><th>Medical staff</th><th>Started</th><th>Ended</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.queue_record?.appointment?.patient?.full_name || "—"}</td>
                    <td>{record.queue_record?.queue_number ?? "—"}</td>
                    <td>{record.staff_profile?.user?.name || "—"}</td>
                    <td>{record.start_time ? new Date(record.start_time).toLocaleString() : "—"}</td>
                    <td>{record.end_time ? new Date(record.end_time).toLocaleString() : "—"}</td>
                    <td><Status value={record.status} /></td>
                    <td><div className="actions">
                      <button type="button" className="text-action" onClick={() => viewConsultation(record)}>View</button>
                      {(isAdmin || record.status !== "completed") && (
                        <button type="button" className="text-action" onClick={() => editConsultation(record)}>Edit</button>
                      )}
                      {isAdmin && (
                        <button type="button" className="text-action danger-text" onClick={() => deleteConsultation(record)}>Delete</button>
                      )}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No consultation records found.</p>}
        {pagination.last_page > 1 && (
          <div className="pagination">
            <button type="button" className="secondary" disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {pagination.current_page} of {pagination.last_page}</span>
            <button type="button" className="secondary" disabled={page >= pagination.last_page || loading}
              onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        )}
      </section>

      {selected && (
        <Modal title={`Consultation #${selected.id}`} onClose={() => setSelected(null)}>
          <dl className="record-details">
            <div><dt>Patient</dt><dd>{selected.queue_record?.appointment?.patient?.full_name || "—"}</dd></div>
            <div><dt>Queue number</dt><dd>{selected.queue_record?.queue_number ?? "—"}</dd></div>
            <div><dt>Medical staff</dt><dd>{selected.staff_profile?.user?.name || "—"}</dd></div>
            <div><dt>Start time</dt><dd>{selected.start_time ? new Date(selected.start_time).toLocaleString() : "—"}</dd></div>
            <div><dt>End time</dt><dd>{selected.end_time ? new Date(selected.end_time).toLocaleString() : "—"}</dd></div>
            <div><dt>Status</dt><dd><Status value={selected.status} /></dd></div>
          </dl>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setSelected(null)}>Close</button>
            {isAdmin && <button type="button" className="danger-button" onClick={() => deleteConsultation(selected)}>Delete record</button>}
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit consultation #${editing.id}`} onClose={() => setEditing(null)}>
          <form className="auth-form" onSubmit={saveConsultation}>
            <div>
              <label htmlFor="edit-consultation-status">Status</label>
              <select id="edit-consultation-status" value={editForm.status}
                onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            {isAdmin && (
              <>
                <div>
                  <label htmlFor="edit-consultation-staff">Medical staff</label>
                  <select id="edit-consultation-staff" value={editForm.staff_profile_id}
                    onChange={(event) => setEditForm({ ...editForm, staff_profile_id: event.target.value })} required>
                    {staff.filter((profile) => profile.user?.role === "medical_staff").map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.user?.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="consultation-start-time">Start time</label>
                  <input id="consultation-start-time" type="datetime-local" value={editForm.start_time}
                    onChange={(event) => setEditForm({ ...editForm, start_time: event.target.value })} />
                </div>
                <div>
                  <label htmlFor="consultation-end-time">End time</label>
                  <input id="consultation-end-time" type="datetime-local" value={editForm.end_time}
                    onChange={(event) => setEditForm({ ...editForm, end_time: event.target.value })} />
                </div>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="primary" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Queue({ user }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const role = String(user.role || "").toLowerCase();

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.get("/queue");
      const queueData = response.data.data ?? response.data;
      setItems(Array.isArray(queueData) ? queueData : []);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(queueId, status) {
    setError("");
    setMessage("");

    try {
      await api.patch(`/queue/${queueId}`, { status });
      setMessage(`Queue status updated to ${status.replaceAll("_", " ")}.`);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <p className="eyebrow">LIVE CLINIC FLOW</p>
          <h1>Today’s queue</h1>
          <p className="muted">
            Check in approved appointments and move patients through their visit.
          </p>
        </div>
        <button type="button" className="secondary" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        {loading ? (
          <p className="empty">Loading today’s queue...</p>
        ) : items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Queue #</th>
                  <th>Patient</th>
                  <th>Appointment</th>
                  <th>Arrival</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const appointment = item.appointment || {};
                  const patient = appointment.patient || {};
                  const arrival = String(item.arrival_time || "");

                  return (
                    <tr key={item.id}>
                      <td><strong>{item.queue_number}</strong></td>
                      <td>{patient.full_name || "—"}</td>
                      <td>
                        {appointment.time
                          ? String(appointment.time).slice(0, 5)
                          : "—"}
                      </td>
                      <td>{arrival ? arrival.slice(11, 16) : "—"}</td>
                      <td><Status value={item.status} /></td>
                      <td>
                        <div className="actions">
                          {item.status === "waiting" && (
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => updateStatus(item.id, "called")}
                            >
                              Call patient
                            </button>
                          )}
                          {role === "medical_staff" && item.status === "called" && (
                            <button
                              type="button"
                              className="text-action"
                              onClick={() =>
                                updateStatus(item.id, "in_consultation")
                              }
                            >
                              Start consultation
                            </button>
                          )}
                          {role === "medical_staff" &&
                            item.status === "in_consultation" && (
                              <button
                                type="button"
                                className="text-action"
                                onClick={() => updateStatus(item.id, "completed")}
                              >
                                Complete visit
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            No patients are checked in today. Check in an approved appointment
            from the Appointments page.
          </p>
        )}
      </section>
    </div>
  );
}

export default App;
