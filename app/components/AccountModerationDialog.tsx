"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Clock,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";

import type { ModerationDecision } from "../lib/accountModeration";

export type AccountModerationAction = "suspend" | "disable" | "restore";

type AccountModerationDialogProps = {
  open: boolean;
  accountName: string;
  accountRole: "customer" | "vendor";
  action: AccountModerationAction;
  processing?: boolean;
  onClose: () => void;
  onConfirm: (decision: ModerationDecision) => Promise<void> | void;
};

type ReasonOption = {
  value: string;
  label: string;
};

const CUSTOMER_REASONS: ReasonOption[] = [
  { value: "fake_orders", label: "Fake or abusive orders" },
  { value: "fraud_scam", label: "Fraud or scam activity" },
  { value: "payment_abuse", label: "Payment abuse or chargeback misuse" },
  { value: "harassment", label: "Harassment or abusive behavior" },
  { value: "spam", label: "Spam or disruptive activity" },
  { value: "policy_violation", label: "Marketplace policy violation" },
  { value: "repeated_violations", label: "Repeated policy violations" },
  { value: "other", label: "Other safety or trust concern" },
];

const VENDOR_REASONS: ReasonOption[] = [
  { value: "fraud_scam", label: "Fraud or scam activity" },
  { value: "misleading_listing", label: "Misleading product or price information" },
  { value: "unsafe_goods", label: "Unsafe or prohibited marketplace item" },
  { value: "non_delivery", label: "Repeated non-delivery or fulfillment failure" },
  { value: "fake_inventory", label: "Fake inventory or availability" },
  { value: "harassment", label: "Harassment or abusive behavior" },
  { value: "policy_violation", label: "Marketplace policy violation" },
  { value: "repeated_violations", label: "Repeated policy violations" },
  { value: "other", label: "Other safety or trust concern" },
];

const SUSPENSION_DURATIONS = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
] as const;

const ACTION_CONTENT: Record<
  AccountModerationAction,
  {
    title: string;
    button: string;
    description: string;
    helper: string;
  }
> = {
  suspend: {
    title: "Temporarily suspend account",
    button: "Confirm suspension",
    description:
      "Temporarily block marketplace access and show the user the reason, duration, and exact return date when they try to sign in.",
    helper:
      "The user will remain identifiable in Firebase, but protected marketplace screens will be blocked until the suspension expires or an admin restores access.",
  },
  disable: {
    title: "Disable account access",
    button: "Disable account",
    description:
      "Block future marketplace access until an administrator manually restores the account.",
    helper:
      "Use Disable for serious or indefinite restrictions. Use Suspend when access should return after a set period.",
  },
  restore: {
    title: "Restore account",
    button: "Restore access",
    description: "Return this account to active marketplace access.",
    helper:
      "Vendor products deactivated during enforcement stay inactive until the vendor reviews them.",
  },
};

function formatReturnDate(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return date.toLocaleString("en-PH", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

export default function AccountModerationDialog({
  open,
  accountName,
  accountRole,
  action,
  processing = false,
  onClose,
  onConfirm,
}: AccountModerationDialogProps) {
  const [reasonCode, setReasonCode] = useState("");
  const [details, setDetails] = useState("");
  const [suspensionDays, setSuspensionDays] = useState(7);
  const [error, setError] = useState("");
  const content = ACTION_CONTENT[action];
  const requiresReason = action !== "restore";
  const reasonOptions = accountRole === "vendor" ? VENDOR_REASONS : CUSTOMER_REASONS;

  const reasonLabel = useMemo(
    () => reasonOptions.find((reason) => reason.value === reasonCode)?.label || "",
    [reasonCode, reasonOptions],
  );

  useEffect(() => {
    if (open) {
      setReasonCode("");
      setDetails("");
      setSuspensionDays(7);
      setError("");
    }
  }, [open, action]);

  if (!open) {
    return null;
  }

  async function submit() {
    const normalizedDetails = details.trim();

    if (requiresReason && !reasonCode) {
      setError("Choose why this account is being restricted.");
      return;
    }

    if (reasonCode === "other" && normalizedDetails.length < 5) {
      setError("Add a short explanation when you choose Other.");
      return;
    }

    if (action === "suspend" && suspensionDays < 1) {
      setError("Choose a valid suspension duration.");
      return;
    }

    setError("");

    await onConfirm({
      reasonCode: action === "restore" ? "admin_restore" : reasonCode,
      reasonLabel: action === "restore" ? "Access restored by administrator" : reasonLabel,
      details: normalizedDetails,
      suspensionDays: action === "suspend" ? suspensionDays : null,
    });
  }

  const Icon =
    action === "restore" ? RotateCcw : action === "disable" ? Ban : ShieldAlert;

  return (
    <div className="modal-overlay" role="presentation">
      <section
        className="modal-container account-moderation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-moderation-title"
      >
        <header className="modal-header">
          <div className={`account-moderation-heading account-moderation-heading--${action}`}>
            <span aria-hidden="true">
              <Icon size={21} strokeWidth={2.4} />
            </span>
            <div>
              <small>{accountRole.toUpperCase()} ACCOUNT</small>
              <h2 id="account-moderation-title">{content.title}</h2>
            </div>
          </div>

          <button
            type="button"
            className="account-moderation-close"
            onClick={onClose}
            disabled={processing}
            aria-label="Close account action"
          >
            <X size={19} strokeWidth={2.4} />
          </button>
        </header>

        <div className="modal-body">
          <div className="account-moderation-subject">
            <span>Selected account</span>
            <strong>{accountName}</strong>
          </div>

          <p className="account-moderation-description">{content.description}</p>

          {requiresReason && (
            <label className="form-group" htmlFor="moderationReason">
              <span>Why is this account being restricted?</span>
              <select
                id="moderationReason"
                className="select"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                disabled={processing}
              >
                <option value="">Select a reason</option>
                {reasonOptions.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {action === "suspend" && (
            <div className="account-moderation-duration-grid">
              <label className="form-group" htmlFor="suspensionDuration">
                <span>Suspension duration</span>
                <select
                  id="suspensionDuration"
                  className="select"
                  value={suspensionDays}
                  onChange={(event) => setSuspensionDays(Number(event.target.value))}
                  disabled={processing}
                >
                  {SUSPENSION_DURATIONS.map((duration) => (
                    <option key={duration.value} value={duration.value}>
                      {duration.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="account-moderation-return-preview">
                <Clock size={18} strokeWidth={2.3} />
                <div>
                  <span>Automatic return date</span>
                  <strong>{formatReturnDate(suspensionDays)}</strong>
                </div>
              </div>
            </div>
          )}

          <label className="form-group" htmlFor="moderationDetails">
            <span>
              {action === "restore"
                ? "Restoration note (optional)"
                : "Explanation shown to the user (recommended)"}
            </span>
            <textarea
              id="moderationDetails"
              className="textarea"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={
                action === "restore"
                  ? "Example: Case reviewed and the restriction can now be lifted."
                  : "Example: Multiple confirmed fake orders were placed after previous warnings."
              }
              maxLength={500}
              disabled={processing}
            />
          </label>

          {error && <div className="account-moderation-error">{error}</div>}

          <div className="account-moderation-helper">
            <AlertTriangle size={17} strokeWidth={2.3} />
            <span>{content.helper}</span>
          </div>
        </div>

        <footer className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={processing}
          >
            Cancel
          </button>
          <button
            type="button"
            className={action === "restore" ? "btn btn-green" : "btn btn-red"}
            onClick={submit}
            disabled={processing}
          >
            {processing ? "Saving decision…" : content.button}
          </button>
        </footer>
      </section>
    </div>
  );
}
