import Link from "next/link";
import { Home, LogIn, ShieldAlert } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo" aria-hidden="true">
          <ShieldAlert size={38} strokeWidth={2.4} />
        </div>

        <h1>Access Denied</h1>

        <p>
          Your account does not have permission to access the IsdaGo Admin
          Portal. Please sign in using an authorized admin account.
        </p>

        <div className="toolbar unauthorized-actions">
          <Link href="/login" className="btn btn-primary">
            <LogIn size={18} strokeWidth={2.4} />
            Back to Login
          </Link>

          <Link href="/" className="btn">
            <Home size={18} strokeWidth={2.4} />
            Go Home
          </Link>
        </div>

        <div className="notice">
          Admin access is restricted based on the user role saved in Firebase
          Realtime Database.
        </div>
      </section>
    </main>
  );
}