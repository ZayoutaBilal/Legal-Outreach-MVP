"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Login failed.");
      }

      router.replace(searchParams.get("next") || "/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoverPassword() {
    setRecovering(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/auth/recover-admin", {
        method: "POST"
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.error || "Unable to send recovery email.");
      }

      setInfo(data.message || "Recovery email sent.");
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : "Unable to send recovery email.");
    } finally {
      setRecovering(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      <button className="button button-primary" disabled={loading} type="submit">
        {loading ? "Connexion..." : "Se connecter"}
      </button>

      <button
        className="button button-secondary"
        disabled={recovering || loading}
        onClick={() => void handleRecoverPassword()}
        type="button"
      >
        {recovering ? "Sending reset..." : "Reset password"}
      </button>

      {info ? <p className="helper-text" style={{ color: "var(--success)", marginTop: 0 }}>{info}</p> : null}
      {error ? <p className="helper-text" style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p> : null}
    </form>
  );
}
