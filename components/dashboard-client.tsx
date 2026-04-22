"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type DashboardPayload = {
  metrics: {
    totalContacts: number;
    sentCount: number;
    pendingCount: number;
    failedCount: number;
  };
  avocats: Array<{
    id: string;
    fullName: string;
    email: string;
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
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    "send" | "retry" | "logout" | "add" | "import" | "export" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    firm_name: "",
    preferred_contact_method: "email"
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    try {
      const query = currentStatus !== "all" ? `?status=${currentStatus}` : "";
      const response = await fetch(`/api/dashboard${query}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Unable to load dashboard data.");
      }

      const payload = (await response.json()) as DashboardPayload;
      setData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [currentStatus]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function onFormChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function runAction(path: string, action: "send" | "retry" | "logout") {
    setActionLoading(action);
    setMessage(null);

    try {
      const response = await fetch(path, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Request failed.");
      }

      if (action === "logout") {
        router.replace("/login");
        router.refresh();
        return;
      }

      const payload = (await response.json()) as ApiResult;
      setMessage(
        payload.message ||
          `Processing complete. ${payload.sent ?? payload.resetCount ?? 0} action(s) applied.`
      );
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAddAvocat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionLoading("add");
    setMessage(null);

    try {
      const response = await fetch("/api/avocats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as ApiResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to add avocat.");
      }

      setForm({
        full_name: "",
        email: "",
        phone: "",
        city: "",
        firm_name: "",
        preferred_contact_method: "email"
      });
      setMessage(payload.message || "Avocat added successfully.");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add avocat.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setActionLoading("import");
    setMessage(null);

    try {
      const fileText = await file.text();
      const payload = JSON.parse(fileText) as unknown;
      const response = await fetch("/api/avocats/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
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
      setActionLoading(null);
    }
  }

  async function handleExport() {
    setActionLoading("export");
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
      setActionLoading(null);
    }
  }

  function updateFilter(status: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }

    router.replace(`/dashboard${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <>
      <div className="dashboard-header">
        <div>
          <span className="hero-note">Suivi des campagnes email pour cabinets d'avocats</span>
          <h1 className="page-title" style={{ marginTop: 18 }}>
            Outreach dashboard
          </h1>
          <p className="page-subtitle">
            Gere vos envois, suivez les erreurs et declenchez une campagne manuellement si
            necessaire.
          </p>
        </div>

        <div className="action-row">
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
            disabled={actionLoading !== null}
            onClick={() => void runAction("/api/send", "send")}
            type="button"
          >
            {actionLoading === "send" ? "Sending..." : "Send Now"}
          </button>
          <button
            className="button button-danger"
            disabled={actionLoading !== null}
            onClick={() => void runAction("/api/retry-failed", "retry")}
            type="button"
          >
            {actionLoading === "retry" ? "Retrying..." : "Retry Failed"}
          </button>
          <button
            className="button button-secondary"
            disabled={actionLoading !== null}
            onClick={() => void runAction("/api/auth/logout", "logout")}
            type="button"
          >
            {actionLoading === "logout" ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>

      <section className="metrics-grid">
        <article className="metric-card glass">
          <p className="metric-label">Total contacts</p>
          <h2 className="metric-value">{data?.metrics.totalContacts ?? "-"}</h2>
        </article>
        <article className="metric-card glass">
          <p className="metric-label">Sent</p>
          <h2 className="metric-value">{data?.metrics.sentCount ?? "-"}</h2>
        </article>
        <article className="metric-card glass">
          <p className="metric-label">Pending</p>
          <h2 className="metric-value">{data?.metrics.pendingCount ?? "-"}</h2>
        </article>
        <article className="metric-card glass">
          <p className="metric-label">Failed</p>
          <h2 className="metric-value">{data?.metrics.failedCount ?? "-"}</h2>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel-card glass">
          <h3 style={{ marginTop: 0 }}>Add avocat</h3>
          <p className="helper-text">
            Create one lawyer contact manually, then use JSON import for bulk additions.
          </p>

          <form className="form-grid" onSubmit={handleAddAvocat} style={{ marginTop: 18 }}>
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

            <div className="full-span">
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                name="email"
                onChange={onFormChange}
                required
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

            <div>
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
              <button
                className="button button-primary"
                disabled={actionLoading !== null}
                type="submit"
              >
                {actionLoading === "add" ? "Adding..." : "Add avocat"}
              </button>
            </div>
          </form>
        </article>

        <article className="panel-card glass">
          <h3 style={{ marginTop: 0 }}>Import / export JSON</h3>
          <p className="helper-text">
            Import an array of avocat objects or export the current avocat list as JSON.
          </p>
          <p className="helper-text">
            JSON fields: full_name, email, phone, city, firm_name, preferred_contact_method.
          </p>

          <div className="action-row" style={{ marginTop: 18 }}>
            <label className="button button-secondary" htmlFor="avocat-import">
              {actionLoading === "import" ? "Importing..." : "Import JSON"}
            </label>
            <input
              id="avocat-import"
              accept=".json,application/json"
              className="file-input"
              disabled={actionLoading !== null}
              onChange={handleImport}
              style={{ display: "none" }}
              type="file"
            />
            <button
              className="button button-secondary"
              disabled={actionLoading !== null}
              onClick={() => void handleExport()}
              type="button"
            >
              {actionLoading === "export" ? "Exporting..." : "Export JSON"}
            </button>
          </div>

          <div className="table-wrap" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>Full name</th>
                  <th>Email</th>
                  <th>City</th>
                  <th>Firm</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {data?.avocats.length ? (
                  data.avocats.map((avocat) => (
                    <tr key={avocat.id}>
                      <td>{avocat.fullName}</td>
                      <td>{avocat.email}</td>
                      <td>{avocat.city || "-"}</td>
                      <td>{avocat.firmName || "-"}</td>
                      <td>{avocat.preferredContactMethod}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--muted)" }}>
                      No avocats available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="table-card glass">
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
                onChange={(event) => updateFilter(event.target.value)}
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
                <th>Email</th>
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
                  <td colSpan={7} style={{ color: "var(--muted)" }}>
                    {loading ? "Loading..." : "No outreach logs available for this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {message ? <p className="status-message">{message}</p> : null}
    </>
  );
}
