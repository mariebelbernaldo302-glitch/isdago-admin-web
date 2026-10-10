"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Store,
  Fish,
  BarChart3,
} from "lucide-react";
import { useRouter } from "next/navigation";

import IsdaGoLogo from "../components/IsdaGoLogo";
import styles from "./login.module.css";
import { createActivityLog } from "../lib/activity";
import {
  auth,
  ensureAuthPersistence,
} from "../lib/firebase";
import { useAuth } from "../providers/AuthProvider";
import {
  consumeLogoutReason,
  INACTIVITY_LOGOUT_REASON,
} from "../lib/session-timeout";

type AdminAuthorizationResponse = {
  authorized?: boolean;
  message?: string;
};

function getLoginErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";

      case "auth/user-disabled":
        return "This admin account has been disabled.";

      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password.";

      case "auth/too-many-requests":
        return "Too many login attempts. Please try again later.";

      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";

      default:
        return "Unable to sign in. Please try again.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unable to sign in. Please try again.";
}

async function authorizeAdmin(idToken: string) {
  const response = await fetch("/api/admin/authorize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response
    .json()
    .catch(() => null)) as AdminAuthorizationResponse | null;

  if (!response.ok || payload?.authorized !== true) {
    throw new Error(
      payload?.message ||
        "This account is not authorized to access the admin portal."
    );
  }
}

export default function LoginPage() {
  const router = useRouter();
  const {
    user,
    role,
    loading: authLoading,
    refreshRole,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 0 &&
      password.trim().length > 0 &&
      !loading
    );
  }, [email, password, loading]);

  useEffect(() => {
    if (!authLoading && user && role === "admin") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, role, router]);

  useEffect(() => {
    const reason = consumeLogoutReason();

    if (reason === INACTIVITY_LOGOUT_REASON) {
      setSessionNotice(
        "You were automatically signed out after 5 minutes of inactivity."
      );
    }
  }, []);

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const emailValue = email.trim().toLowerCase();

    if (!emailValue || !password) {
      setError("Please enter your admin email and password.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      /*
       * Step 1: Firebase Authentication verifies the email
       * and password through the browser SDK.
       */
      await ensureAuthPersistence();

      const credential = await signInWithEmailAndPassword(
        auth,
        emailValue,
        password
      );

      /*
       * Step 2: Send the signed-in user's Firebase ID token
       * to a server-only API route.
       *
       * The API route verifies the token with Firebase Admin,
       * checks FIREBASE_ADMIN_EMAILS, adds the admin claim,
       * and creates/repairs users/{uid} in Realtime Database.
       */
      const resolvedRole = await refreshRole(
        credential.user,
        true
      );

      if (resolvedRole !== "admin") {
        await signOut(auth);
        setError(
          "Admin authorization was created, but the dashboard role could not be refreshed. Please sign in again."
        );
        return;
      }

      try {
        await createActivityLog({
          type: "Admin Login",
          description: `Admin signed in: ${
            credential.user.email ?? emailValue
          }`,
          module: "Authentication",
        });
      } catch (activityError) {
        console.warn(
          "Login activity log was not created:",
          activityError
        );
      }

      router.replace("/dashboard");
    } catch (loginError) {
      try {
        await signOut(auth);
      } catch {
        // Ignore sign-out cleanup errors.
      }

      setError(getLoginErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <aside
        className={styles.hero}
        style={{
          backgroundImage:
            "linear-gradient(160deg, rgba(6,38,51,0.88), rgba(11,61,79,0.72) 55%, rgba(26,107,60,0.8)), url(/images/catbalogan-port.jpg)",
        }}
      >
        <div className={styles.brandText}>
          <strong>IsdaGo</strong>
          <span>Seafood marketplace · Catbalogan City</span>
        </div>

        <div className={styles.accentBar} />
        <div className={styles.eyebrow}>ADMINISTRATION PORTAL</div>
        <h2>Fresh from the Catbalogan port, managed in one place.</h2>
        <p className={styles.lead}>
          Manage the seafood marketplace, vendors, products, orders,
          and transactions of the City Economic Enterprise &amp;
          Public Utility Office.
        </p>

        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>
              <Store size={18} />
            </span>
            <div>
              <b>Vendor &amp; Approval Management</b>
              <span>Review and monitor registered fish vendors</span>
            </div>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>
              <Fish size={18} />
            </span>
            <div>
              <b>Products &amp; Orders</b>
              <span>
                Track listings, price compliance and deliveries
              </span>
            </div>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>
              <BarChart3 size={18} />
            </span>
            <div>
              <b>Transactions &amp; Reports</b>
              <span>Sales, activity logs and system reports</span>
            </div>
          </div>
        </div>
      </aside>

      <section className={styles.formSide}>
        <form className={styles.card} onSubmit={handleLogin}>
          <div className={styles.logoWrap}>
            <IsdaGoLogo />
          </div>

          <div className={styles.tag}>AUTHORIZED PERSONNEL ONLY</div>
          <h1>Sign in to IsdaGo Admin</h1>
          <p className={styles.sub}>
            Enter your administrator credentials to continue.
          </p>

          {sessionNotice && (
            <div className={styles.notice} role="status">
              <strong>Session ended</strong>
              <div>{sessionNotice}</div>
            </div>
          )}

          {error && (
            <div className={styles.errorBox} role="alert">
              <strong>Login failed</strong>
              <p>{error}</p>
            </div>
          )}

          <div className={styles.group}>
            <label htmlFor="admin-email">
              <Mail size={16} strokeWidth={2.4} />
              Email Address
            </label>
            <input
              id="admin-email"
              className={styles.input}
              type="email"
              placeholder="admin@isdago.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={loading}
              required
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="admin-password">
              <Lock size={16} strokeWidth={2.4} />
              Password
            </label>
            <div className={styles.passwordField}>
              <input
                id="admin-password"
                className={styles.input}
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="current-password"
                disabled={loading}
                required
              />
              <button
                type="button"
                className={styles.toggle}
                onClick={() =>
                  setShowPassword((currentValue) => !currentValue)
                }
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={2.4} />
                ) : (
                  <Eye size={18} strokeWidth={2.4} />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={styles.submit}
            disabled={!canSubmit}
          >
            <LogIn size={18} strokeWidth={2.4} />
            {loading ? "Verifying admin access..." : "Sign In"}
          </button>

          <div className={styles.foot}>
            City Economic Enterprise &amp; Public Utility Office ·
            Catbalogan City
          </div>
        </form>
      </section>
    </main>
  );
}
