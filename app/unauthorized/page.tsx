import Link from "next/link";
import { Home, LogIn, ShieldAlert } from "lucide-react";

import IsdaGoLogo from "../components/IsdaGoLogo";

export default function UnauthorizedPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <IsdaGoLogo label="IsdaGo Admin" />

        <div className="unauthorized-heading-icon" aria-hidden="true">
          <ShieldAlert size={24} strokeWidth={2.4} />
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
          Admin access is restricted by the verified Firebase Authentication role
          and the server-side administrator allowlist.
        </div>
      </section>
    </main>
  );
}
