"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";

export type AccountModerationAction = "suspend" | "disable" | "restore";

type AccountModerationDialogProps = {
  open: boolean;
  accountName: string;
  accountRole: "customer" | "vendor";
  action: AccountModerationAction;
  processing?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
};

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
    title: "Suspend account",
    button: "Confirm suspension",
    description:
      "Temporarily block this account while preserving reports, orders, and audit evidence.",
    helper: "A clear reason is required and will be recorded in the audit trail.",
  },
  disable: {
    title: "Disable account access",
    button: "Disable account",
    description:
      "Disable future access without deleting investigation evidence from Firebase.",
    helper:
      "This does not delete the Firebase Authentication identity. Permanent Auth deletion requires a protected Admin SDK endpoint.",
  },
  restore: {
    title: "Restore account",
    button: "Restore access",
    description: "Return this account to active marketplace access.",
    helper:
      "Vendor products deactivated during enforcement stay inactive until the vendor reviews them.",
  },
};

export default function AccountModerationDialog({
  open,
  accountName,
  accountRole,
  action,
  processing = false,
  onClose,
  onConfirm,
}: AccountModerationDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const content = ACTION_CONTENT[action];
  const requiresReason = action !== "restore";

  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open, action]);

  if (!open) {
    return null;
  }

  async function submit() {
    const normalizedReason = reason.trim();

    if (requiresReason && normalizedReason.length < 5) {
      setError("Enter a clear reason of at least 5 characters.");
      return;
    }

    setError("");
    await onConfirm(normalizedReason);
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

          <label className="form-group" htmlFor="moderationReason">
            <span>
              {requiresReason ? "Reason for this action" : "Restoration note (optional)"}
            </span>
            <textarea
              id="moderationReason"
              className="textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                requiresReason
                  ? "Example: Confirmed scam report after reviewing the submitted evidence."
                  : "Add an internal note about why access is being restored."
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
