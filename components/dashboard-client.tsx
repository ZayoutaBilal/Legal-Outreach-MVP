"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ResponsiveContainer } from "recharts";

type DashboardPayload = {
  metrics: {
    totalContacts: number;
    sentCount: number;
    pendingCount: number;
    failedCount: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    search: string;
  };
  analytics: {
    sentByChannel: Array<{ label: string; key: string; count: number }>;
    sentByHour: Array<{ hour: string; count: number }>;
    sentByDay: Array<{ day: string; count: number }>;
    sentByWeek: Array<{ week: string; count: number }>;
    sentByCity: Array<{ city: string; count: number }>;
  };
  avocats: Array<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    firmName: string | null;
    preferredContactMethod: "email" | "whatsapp" | "both";
  }>;
  logs: Array<{
    id: string;
    lawyerName: string;
    email: string;
    status: "pending" | "sent" | "failed";
    attempts: number;
    lastError: string | null;
    sentAt: string | null;
    campaignName: string;
    city: string;
  }>;
};

type ApiResult = {
  message?: string;
  processed?: number;
  sent?: number;
  failed?: number;
  resetCount?: number;
  created?: number;
  skipped?: number;
  errors?: string[];
};

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  firm_name: string;
  preferred_contact_method: "email" | "whatsapp" | "both";
};

type ImportMode = "standard" | "enrich-websites";

type SettingsState = {
  email: string;
  password: string;
  smtpFrom: string;
};

const emptyForm: FormState = {
  full_name: "",
  email: "",
  phone: "",
  city: "",
  firm_name: "",
  preferred_contact_method: "email"
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentPage = Number(searchParams.get("page") || "1");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [importMode, setImportMode] = useState<ImportMode>("standard");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SettingsState>({
    email: "",
    password: "",
    smtpFrom: ""
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (currentStatus !== "all") {
        params.set("status", currentStatus);
      }

      if (currentSearch) {
        params.set("search", currentSearch);
      }

      if (currentPage > 1) {
        params.set("page", String(currentPage));
      }

      const [dashboardResponse, settingsResponse] = await Promise.all([
        fetch(`/api/dashboard${params.toString() ? `?${params.toString()}` : ""}`, {
          cache: "no-store"
        }),
        fetch("/api/settings", {
          cache: "no-store"
        })
      ]);

      if (!dashboardResponse.ok) {
        throw new Error("Unable to load dashboard data.");
      }

      const payload = (await dashboardResponse.json()) as DashboardPayload;
      setData(payload);

      if (settingsResponse.ok) {
        const settingsPayload = (await settingsResponse.json()) as SettingsState;
        setSettingsForm(settingsPayload);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentSearch, currentStatus]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  function updateParams(next: { status?: string; search?: string; page?: number }) {
    const params = new URLSearchParams(searchParams.toString());

    if (next.status !== undefined) {
      if (next.status === "all") {
        params.delete("status");
      } else {
        params.set("status", next.status);
      }
    }

    if (next.search !== undefined) {
      if (next.search.trim()) {
        params.set("search", next.search.trim());
      } else {
        params.delete("search");
      }
    }

    if (next.page !== undefined) {
      if (next.page > 1) {
        params.set("page", String(next.page));
      } else {
        params.delete("page");
      }
    }

    router.replace(`/dashboard${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function onFormChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function onSettingsChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setSettingsForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function runAction(path: string, actionKey: string, options?: { method?: string; body?: unknown }) {
    setBusyKey(actionKey);
    setMessage(null);

    try {
      const response = await fetch(path, {
        method: options?.method || "POST",
        headers: options?.body
          ? {
              "Content-Type": "application/json"
            }
          : undefined,
        body: options?.body ? JSON.stringify(options.body) : undefined
      });

      const payload = (await response.json()) as ApiResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
      }

      if (actionKey === "logout") {
        router.replace("/login");
        router.refresh();
        return true;
      }

      setMessage(payload.message || "Action completed successfully.");
      await loadDashboard();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let success = false;

    if (editingId) {
      success = await runAction(`/api/avocats/${editingId}`, "save-avocat", {
        method: "PUT",
        body: form
      });
    } else {
      success = await runAction("/api/avocats", "add-avocat", {
        method: "POST",
        body: form
      });
    }

    if (success) {
      resetForm();
    }
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("/api/settings", "save-settings", {
      method: "PUT",
      body: {
        email: settingsForm.email,
        password: settingsForm.password
      }
    });
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBusyKey("import");
    setMessage(null);

    try {
      const fileText = await file.text();
      const payload = JSON.parse(fileText) as unknown;
      const response = await fetch("/api/avocats/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          importMode,
          items: payload
        })
      });
      const result = (await response.json()) as ApiResult & { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Unable to import avocats.");
      }

      const importMessage = [result.message, result.errors?.slice(0, 3).join(" | ")]
        .filter(Boolean)
        .join(" ");
      setMessage(importMessage);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import avocats.");
    } finally {
      event.target.value = "";
      setBusyKey(null);
    }
  }

  async function handleExport() {
    setBusyKey("export");
    setMessage(null);

    try {
      const response = await fetch("/api/avocats/export", {
        method: "GET"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to export avocats.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "avocats-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Avocats exported successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export avocats.");
    } finally {
      setBusyKey(null);
    }
  }

  function startEdit(avocat: DashboardPayload["avocats"][number]) {
    setEditingId(avocat.id);
    setForm({
      full_name: avocat.fullName,
      email: avocat.email || "",
      phone: avocat.phone || "",
      city: avocat.city || "",
      firm_name: avocat.firmName || "",
      preferred_contact_method: avocat.preferredContactMethod
    });
  }

  return (
    <div className="dashboard-layout">
      <header className="dashboard-nav">
        <div className="nav-brand">
          <h1 className="page-title">Outreach Dashboard 2026</h1>
          <span className="hero-note">Suivi des campagnes email pour cabinets d'avocats</span>
          <p className="page-subtitle">
            Search contacts, manage outreach, monitor delivery performance, and manage admin
            credentials from one place.
          </p>
        </div>

        <div className="nav-actions">
          <button
            aria-label="Open admin settings"
            className="button button-secondary"
            disabled={busyKey !== null}
            onClick={() => setIsSettingsOpen(true)}
            type="button"
          >
            <svg
              aria-hidden="true"
              height="16"
              viewBox="0 0 24 24"
              width="16"
              style={{ marginRight: 8 }}
            >
              <path
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
                fill="currentColor"
              />
            </svg>
            Settings
          </button>
          <button
            className="button button-secondary"
            disabled={loading}
            onClick={() => void loadDashboard()}
            type="button"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="button button-primary"
            disabled={busyKey !== null}
            onClick={() => void runAction("/api/send", "send")}
            type="button"
          >
            {busyKey === "send" ? "Sending..." : "Send Now"}
          </button>
          <button
            className="button button-danger"
            disabled={busyKey !== null}
            onClick={() => void runAction("/api/retry-failed", "retry")}
            type="button"
          >
            {busyKey === "retry" ? "Retrying..." : "Retry Failed"}
          </button>
          <button
            className="button button-secondary"
            disabled={busyKey !== null}
            onClick={() => void runAction("/api/auth/logout", "logout")}
            type="button"
          >
            {busyKey === "logout" ? "Logging out..." : "Logout"}
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="metrics-section">
          <h2 className="section-title">Key Metrics</h2>
          <div className="metrics-grid">
            <article className="metric-card">
              <p className="metric-label">Total contacts</p>
              <h2 className="metric-value">{data?.metrics.totalContacts ?? "-"}</h2>
            </article>
            <article className="metric-card">
              <p className="metric-label">Sent</p>
              <h2 className="metric-value">{data?.metrics.sentCount ?? "-"}</h2>
            </article>
            <article className="metric-card">
              <p className="metric-label">Pending</p>
              <h2 className="metric-value">{data?.metrics.pendingCount ?? "-"}</h2>
            </article>
            <article className="metric-card">
              <p className="metric-label">Failed</p>
              <h2 className="metric-value">{data?.metrics.failedCount ?? "-"}</h2>
            </article>
          </div>
        </section>

        <section className="analytics-section">
          <h2 className="section-title">Analytics</h2>
          <div className="charts-grid">
            <article className="chart-card glass">
              <h3>Sent by Channel</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data?.analytics.sentByChannel || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {data?.analytics.sentByChannel.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#6b4423', '#8b5d3f', '#a87843'][index % 3]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="chart-card glass">
              <h3>Sent by Hour</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data?.analytics.sentByHour || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" stroke="var(--muted)" />
                    <YAxis stroke="var(--muted)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
                    <Line type="monotone" dataKey="count" stroke="#8b5d3f" strokeWidth={2} dot={{ fill: '#8b5d3f' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="chart-card glass">
              <h3>Sent by Day</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data?.analytics.sentByDay || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--muted)" />
                    <YAxis stroke="var(--muted)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
                    <Bar dataKey="count" fill="#8b5d3f" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="chart-card glass">
              <h3>Sent by Week</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data?.analytics.sentByWeek || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" stroke="var(--muted)" />
                    <YAxis stroke="var(--muted)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
                    <Bar dataKey="count" fill="#6b4423" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="chart-card glass">
              <h3>Sent by City</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data?.analytics.sentByCity || []} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted)" />
                    <YAxis dataKey="city" type="category" stroke="var(--muted)" width={80} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-elevated', border: '1px solid var(--border)' }} />
                    <Bar dataKey="count" fill="#a87843" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>
        </section>

        <section className="management-section">
          <h2 className="section-title">Contact Management</h2>
          <div className="panel-grid">
            <article className="panel-card glass">
              <h3>{editingId ? "Update avocat" : "Add avocat"}</h3>
              <p className="helper-text">
                Manage one contact at a time here, or use JSON import/export for bulk operations.
              </p>

              <form className="form-grid" onSubmit={handleSubmit} style={{ marginTop: 18 }}>
                <div className="full-span">
                  <label className="label" htmlFor="full_name">
                    Full name
                  </label>
                  <input
                    id="full_name"
                    className="input"
                    name="full_name"
                    onChange={onFormChange}
                    required
                    value={form.full_name}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    className="input"
                    name="email"
                    onChange={onFormChange}
                    type="email"
                    value={form.email}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="phone">
                    Phone
                  </label>
                  <input
                    id="phone"
                    className="input"
                    name="phone"
                    onChange={onFormChange}
                    value={form.phone}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="city">
                    City
                  </label>
                  <input
                    id="city"
                    className="input"
                    name="city"
                    onChange={onFormChange}
                    value={form.city}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="firm_name">
                    Firm name
                  </label>
                  <input
                    id="firm_name"
                    className="input"
                    name="firm_name"
                    onChange={onFormChange}
                    value={form.firm_name}
                  />
                </div>

                <div className="full-span">
                  <label className="label" htmlFor="preferred_contact_method">
                    Preferred contact
                  </label>
                  <select
                    id="preferred_contact_method"
                    className="select"
                    name="preferred_contact_method"
                    onChange={onFormChange}
                    value={form.preferred_contact_method}
                  >
                    <option value="email">email</option>
                    <option value="whatsapp">whatsapp</option>
                    <option value="both">both</option>
                  </select>
                </div>

                <div className="full-span action-row" style={{ marginTop: 8 }}>
                  <button className="button button-primary" disabled={busyKey !== null} type="submit">
                    {busyKey === "add-avocat" || busyKey === "save-avocat"
                      ? "Saving..."
                      : editingId
                        ? "Update avocat"
                        : "Add avocat"}
                  </button>
                  {editingId ? (
                    <button className="button button-secondary" onClick={resetForm} type="button">
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
            </article>

            <article className="panel-card">
              <h3>Import / export JSON</h3>
              <p className="helper-text">
                Import Apify raw JSON with direct save mode or website email enrichment mode.
              </p>

              <div style={{ marginTop: 18 }}>
                <label className="label" htmlFor="import-mode">
                  Import mode
                </label>
                <select
                  id="import-mode"
                  className="select"
                  onChange={(event) => setImportMode(event.target.value as ImportMode)}
                  value={importMode}
                >
                  <option value="standard">1. Import with current logic</option>
                  <option value="enrich-websites">
                    2. Import and enrich missing emails from website via Apify
                  </option>
                </select>
              </div>

              <div className="action-row" style={{ marginTop: 18 }}>
                <label className="button button-secondary" htmlFor="avocat-import">
                  {busyKey === "import" ? "Importing..." : "Import JSON"}
                </label>
                <input
                  id="avocat-import"
                  accept=".json,application/json"
                  className="file-input"
                  disabled={busyKey !== null}
                  onChange={handleImport}
                  style={{ display: "none" }}
                  type="file"
                />
                <button
                  className="button button-secondary"
                  disabled={busyKey !== null}
                  onClick={() => void handleExport()}
                  type="button"
                >
                  {busyKey === "export" ? "Exporting..." : "Export JSON"}
                </button>
              </div>
            </article>
          </div>
        </section>

        <section className="contacts-section">
          <div className="table-card glass">
            <div style={{ padding: 18 }}>
              <div className="toolbar">
                <div>
                  <h3>Avocats</h3>
                  <p className="helper-text">{data?.pagination.totalItems ?? 0} contact(s) found.</p>
                </div>

                <form
                  className="search-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateParams({ search: searchInput, page: 1 });
                  }}
                >
                  <input
                    className="input"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search by name, city, phone, email, firm..."
                    value={searchInput}
                  />
                  <button className="button button-secondary" type="submit">
                    Search
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setSearchInput("");
                      updateParams({ search: "", page: 1 });
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                </form>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Full name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th>Firm</th>
                    <th>Contact</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.avocats.length ? (
                    data.avocats.map((avocat) => (
                      <tr key={avocat.id}>
                        <td>{avocat.fullName}</td>
                        <td>{avocat.email || "-"}</td>
                        <td>{avocat.phone || "-"}</td>
                        <td>{avocat.city || "-"}</td>
                        <td>{avocat.firmName || "-"}</td>
                        <td>{avocat.preferredContactMethod}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="button button-secondary"
                              onClick={() => startEdit(avocat)}
                              type="button"
                            >
                              Update
                            </button>
                            <button
                              className="button button-primary"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runAction(`/api/avocats/${avocat.id}/send`, `send-${avocat.id}`)
                              }
                              type="button"
                            >
                              {busyKey === `send-${avocat.id}` ? "Sending..." : "Send"}
                            </button>
                            <button
                              className="button button-danger"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runAction(`/api/avocats/${avocat.id}`, `delete-${avocat.id}`, {
                                  method: "DELETE"
                                })
                              }
                              type="button"
                            >
                              {busyKey === `delete-${avocat.id}` ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ color: "var(--muted)" }}>
                        {loading ? "Loading..." : "No avocats available for this search."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pager">
              <span className="helper-text">
                Page {data?.pagination.page ?? 1} of {data?.pagination.totalPages ?? 1}
              </span>
              <div className="action-row">
                <button
                  className="button button-secondary"
                  disabled={!data || data.pagination.page <= 1}
                  onClick={() => updateParams({ page: (data?.pagination.page || 1) - 1 })}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="button button-secondary"
                  disabled={!data || data.pagination.page >= data.pagination.totalPages}
                  onClick={() => updateParams({ page: (data?.pagination.page || 1) + 1 })}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="logs-section">
          <div className="table-card glass">
            <div style={{ padding: 18 }}>
              <div className="toolbar">
                <div>
                  <h3 style={{ margin: 0 }}>Delivery logs</h3>
                  <p className="helper-text">Filter the status and monitor the latest outreach runs.</p>
                </div>

                <div style={{ minWidth: 220 }}>
                  <label className="label" htmlFor="status-filter">
                    Filter by status
                  </label>
                  <select
                    id="status-filter"
                    className="select"
                    onChange={(event) => updateParams({ status: event.target.value, page: 1 })}
                    value={currentStatus}
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lawyer name</th>
                    <th>Contact</th>
                    <th>City</th>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Last error</th>
                    <th>Sent date</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.logs.length ? (
                    data.logs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.lawyerName}</td>
                        <td>{log.email}</td>
                        <td>{log.city}</td>
                        <td>{log.campaignName}</td>
                        <td>
                          <span className={`badge badge-${log.status}`}>{log.status}</span>
                        </td>
                        <td>{log.attempts}</td>
                        <td>{log.lastError || "-"}</td>
                        <td>{formatDate(log.sentAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ color: "var(--muted)" }}>
                        {loading ? "Loading..." : "No outreach logs available for this filter."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {isSettingsOpen ? (
        <>
          <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)} />
          <div
            aria-labelledby="admin-settings-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <div className="modal-header">
              <h2 id="admin-settings-title">Admin settings</h2>
              <p className="helper-text">
                Update admin access and send the current credentials to the sender inbox.
              </p>
            </div>
            <div className="modal-body">
              <form className="form-grid" id="admin-settings-form" onSubmit={handleSettingsSubmit}>
                <div className="full-span">
                  <label className="label" htmlFor="settings-email">
                    Admin email
                  </label>
                  <input
                    id="settings-email"
                    className="input"
                    name="email"
                    onChange={onSettingsChange}
                    type="email"
                    value={settingsForm.email}
                  />
                </div>

                <div className="full-span">
                  <label className="label" htmlFor="settings-password">
                    Admin password
                  </label>
                  <input
                    id="settings-password"
                    className="input"
                    name="password"
                    onChange={onSettingsChange}
                    type="text"
                    value={settingsForm.password}
                  />
                </div>

                <div className="full-span">
                  <label className="label" htmlFor="settings-smtp">
                    Recovery email destination
                  </label>
                  <input
                    id="settings-smtp"
                    className="input"
                    name="smtpFrom"
                    readOnly
                    value={settingsForm.smtpFrom}
                  />
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button
                className="button button-secondary"
                disabled={busyKey !== null}
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                Close
              </button>
              <button
                className="button button-secondary"
                disabled={busyKey !== null}
                onClick={() => void runAction("/api/settings/recover-admin", "recover-admin")}
                type="button"
              >
                {busyKey === "recover-admin" ? "Sending..." : "Send recovery email"}
              </button>
              <button
                className="button button-primary"
                disabled={busyKey !== null}
                form="admin-settings-form"
                type="submit"
              >
                {busyKey === "save-settings" ? "Saving..." : "Save settings"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {message ? <p className="status-message">{message}</p> : null}
    </div>
  );
}
