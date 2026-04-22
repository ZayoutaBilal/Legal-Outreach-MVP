import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="shell">
      <div className="container auth-grid">
        <section className="auth-card glass">
          <span className="hero-note">Admin access only</span>
          <h1 className="page-title" style={{ marginTop: 22 }}>
            Legal outreach control room
          </h1>
          <p className="page-subtitle">
            Connectez-vous pour piloter les campagnes, vérifier les statuts et lancer un envoi
            manuel.
          </p>

          <Suspense>
            <LoginForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
