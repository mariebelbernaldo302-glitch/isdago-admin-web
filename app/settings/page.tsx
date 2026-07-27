"use client";

import { useState } from "react";
import {
  Activity,
  BadgeCheck,
  Ban,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Database,
  FileLock2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  PackageX,
  RotateCcw,
  ShieldCheck,
  Siren,
  UserRound,
  WalletCards,
} from "lucide-react";

import DashboardShell from "../components/DashboardShell";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../providers/AuthProvider";

import styles from "./settings.module.css";

function getInitials(name?: string | null, email?: string | null) {
  const source = name || email?.split("@")[0] || "Administrator";
  const parts = source.split(/[\s._-]+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatLastSignIn(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [uidCopied, setUidCopied] = useState(false);

  const administratorName = user?.displayName || "Administrator";
  const administratorEmail = user?.email || "No email available";
  const initials = getInitials(user?.displayName, user?.email);

  async function copyUid() {
    if (!user?.uid || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(user.uid);
    setUidCopied(true);
  }

  return (
    <DashboardShell
      title="Admin & Security"
      description="Manage administrator identity, enforcement safeguards, and data-protection boundaries."
    >
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="security-hero-title">
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>
              <ShieldCheck size={16} strokeWidth={2.5} />
              Trust &amp; Safety administration
            </span>

            <h2 id="security-hero-title">Security control center</h2>
            <p>
              Monitor account access, document enforcement decisions, and protect
              marketplace evidence from one focused workspace.
            </p>

            <div className={styles.heroBadges}>
              <span>
                <i aria-hidden="true" /> Protected session
              </span>
              <span>
                <CheckCircle2 size={15} strokeWidth={2.5} /> Audit logging enabled
              </span>
            </div>
          </div>

          <div className={styles.securityScore} aria-label="Security status">
            <div className={styles.scoreIcon}>
              <ShieldCheck size={30} strokeWidth={2.2} />
            </div>
            <div>
              <span>Security posture</span>
              <strong>Protected</strong>
              <small>4 of 4 safeguards active</small>
            </div>
            <div className={styles.scoreBar} aria-hidden="true">
              <span />
            </div>
          </div>
        </section>

        <section className={styles.metrics} aria-label="Security overview">
          <article className={styles.metricCard}>
            <span className={`${styles.metricIcon} ${styles.purple}`}>
              <KeyRound size={21} strokeWidth={2.3} />
            </span>
            <div>
              <span>Portal role</span>
              <strong>Administrator</strong>
              <small>Privileged access</small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={`${styles.metricIcon} ${styles.green}`}>
              <BadgeCheck size={21} strokeWidth={2.3} />
            </span>
            <div>
              <span>Account access</span>
              <strong>Active</strong>
              <small>Authenticated session</small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={`${styles.metricIcon} ${styles.blue}`}>
              <Database size={21} strokeWidth={2.3} />
            </span>
            <div>
              <span>Monitoring source</span>
              <strong>Realtime</strong>
              <small>Firebase connected</small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={`${styles.metricIcon} ${styles.amber}`}>
              <Activity size={21} strokeWidth={2.3} />
            </span>
            <div>
              <span>Audit mode</span>
              <strong>Enabled</strong>
              <small>Actions are recorded</small>
            </div>
          </article>
        </section>

        <div className={styles.primaryGrid}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.sectionLabel}>Administrator profile</span>
                <h3>Identity &amp; access</h3>
                <p>The Firebase account currently signed in to this portal.</p>
              </div>
              <Fingerprint size={22} strokeWidth={2.2} aria-hidden="true" />
            </header>

            <div className={styles.identityCard}>
              <div className={styles.avatar} aria-hidden="true">
                {initials}
              </div>
              <div className={styles.identityText}>
                <strong>{administratorName}</strong>
                <span>{administratorEmail}</span>
              </div>
              <StatusBadge status="active" />
            </div>

            <dl className={styles.detailsList}>
              <div>
                <dt>
                  <UserRound size={16} strokeWidth={2.3} /> Role
                </dt>
                <dd>Administrator</dd>
              </div>
              <div>
                <dt>
                  <BadgeCheck size={16} strokeWidth={2.3} /> Email status
                </dt>
                <dd>
                  {user?.emailVerified ? (
                    <span className={styles.verified}>Verified</span>
                  ) : (
                    <span className={styles.pending}>Not verified</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={16} strokeWidth={2.3} /> Last sign-in
                </dt>
                <dd>{formatLastSignIn(user?.metadata.lastSignInTime)}</dd>
              </div>
              <div className={styles.uidRow}>
                <dt>
                  <Fingerprint size={16} strokeWidth={2.3} /> Firebase UID
                </dt>
                <dd>
                  <code>{user?.uid || "Unavailable"}</code>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={copyUid}
                    disabled={!user?.uid}
                    aria-label="Copy Firebase UID"
                  >
                    {uidCopied ? (
                      <Check size={15} strokeWidth={2.5} />
                    ) : (
                      <Copy size={15} strokeWidth={2.3} />
                    )}
                    {uidCopied ? "Copied" : "Copy"}
                  </button>
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.sectionLabel}>System assurance</span>
                <h3>Security health</h3>
                <p>Core protections expected for administrative monitoring.</p>
              </div>
              <LockKeyhole size={22} strokeWidth={2.2} aria-hidden="true" />
            </header>

            <div className={styles.healthList}>
              <article>
                <span className={styles.healthCheck}>
                  <Check size={16} strokeWidth={3} />
                </span>
                <div>
                  <strong>Authenticated admin session</strong>
                  <p>Portal access is tied to the signed-in Firebase identity.</p>
                </div>
                <span className={styles.healthStatus}>Active</span>
              </article>
              <article>
                <span className={styles.healthCheck}>
                  <Check size={16} strokeWidth={3} />
                </span>
                <div>
                  <strong>Realtime monitoring</strong>
                  <p>Account, report, and application records stay synchronized.</p>
                </div>
                <span className={styles.healthStatus}>Online</span>
              </article>
              <article>
                <span className={styles.healthCheck}>
                  <Check size={16} strokeWidth={3} />
                </span>
                <div>
                  <strong>Documented enforcement</strong>
                  <p>Restriction decisions require a reason and target account.</p>
                </div>
                <span className={styles.healthStatus}>Required</span>
              </article>
              <article>
                <span className={styles.healthCheck}>
                  <Check size={16} strokeWidth={3} />
                </span>
                <div>
                  <strong>Audit trail</strong>
                  <p>Administrative decisions are recorded in Activity Logs.</p>
                </div>
                <span className={styles.healthStatus}>Enabled</span>
              </article>
            </div>
          </section>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>Enforcement standard</span>
              <h3>Account action workflow</h3>
              <p>Use the least destructive action that safely resolves the case.</p>
            </div>
            <ClipboardCheck size={22} strokeWidth={2.2} aria-hidden="true" />
          </header>

          <div className={styles.enforcementFlow}>
            <article>
              <span className={`${styles.flowIcon} ${styles.blue}`}>
                <Siren size={20} strokeWidth={2.3} />
              </span>
              <span className={styles.stepNumber}>01</span>
              <strong>Review evidence</strong>
              <p>Confirm reports, identities, history, and supporting records.</p>
            </article>
            <article>
              <span className={`${styles.flowIcon} ${styles.amber}`}>
                <Clock3 size={20} strokeWidth={2.3} />
              </span>
              <span className={styles.stepNumber}>02</span>
              <strong>Suspend first</strong>
              <p>Temporarily restrict access while preserving all case evidence.</p>
            </article>
            <article>
              <span className={`${styles.flowIcon} ${styles.red}`}>
                <Ban size={20} strokeWidth={2.3} />
              </span>
              <span className={styles.stepNumber}>03</span>
              <strong>Disable confirmed scams</strong>
              <p>Block future access and deactivate related vendor listings.</p>
            </article>
            <article>
              <span className={`${styles.flowIcon} ${styles.green}`}>
                <RotateCcw size={20} strokeWidth={2.3} />
              </span>
              <span className={styles.stepNumber}>04</span>
              <strong>Restore carefully</strong>
              <p>Reactivate cleared accounts; review listings separately.</p>
            </article>
          </div>

          <div className={styles.policyNotice} role="note">
            <FileLock2 size={19} strokeWidth={2.3} />
            <div>
              <strong>Evidence-preserving policy</strong>
              <p>
                Suspending or disabling an account keeps reports, orders,
                payments, messages, and audit history available for investigation.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.sectionLabel}>Protected data</span>
              <h3>Data protection boundary</h3>
              <p>Sensitive operations intentionally kept outside the browser.</p>
            </div>
            <FileLock2 size={22} strokeWidth={2.2} aria-hidden="true" />
          </header>

          <div className={styles.boundaryGrid}>
            <article>
              <span className={`${styles.boundaryIcon} ${styles.purple}`}>
                <KeyRound size={21} strokeWidth={2.3} />
              </span>
              <div>
                <span>Authentication identity</span>
                <strong>Server-protected deletion</strong>
                <p>Permanent deletion requires a secured Firebase Admin SDK endpoint.</p>
              </div>
              <span className={styles.boundaryBadge}>Backend only</span>
            </article>
            <article>
              <span className={`${styles.boundaryIcon} ${styles.blue}`}>
                <WalletCards size={21} strokeWidth={2.3} />
              </span>
              <div>
                <span>Orders and payments</span>
                <strong>Retained as case evidence</strong>
                <p>Financial and fulfillment records remain available to reviewers.</p>
              </div>
              <span className={styles.boundaryBadge}>Preserved</span>
            </article>
            <article>
              <span className={`${styles.boundaryIcon} ${styles.red}`}>
                <PackageX size={21} strokeWidth={2.3} />
              </span>
              <div>
                <span>Vendor product listings</span>
                <strong>Deactivated on restriction</strong>
                <p>Listings are hidden without destroying their investigation history.</p>
              </div>
              <span className={styles.boundaryBadge}>Controlled</span>
            </article>
          </div>
        </section>
      </main>
    </DashboardShell>
  );
}
