import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  hasConfiguredAdminEmails,
  isAllowedAdminEmail,
} from "../../../lib/admin-allowlist";

import {
  getAdminAuth,
  getAdminDatabase,
  getFirebaseAdminConfigurationStatus,
} from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingAdminProfile = {
  createdAt?: unknown;
  status?: unknown;
  accountStatus?: unknown;
  disabled?: unknown;
  blocked?: unknown;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function unauthorized(message: string) {
  return jsonResponse(
    {
      authorized: false,
      message,
    },
    403
  );
}

function normalizeStatus(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function isBlockedProfile(
  profile: ExistingAdminProfile
) {
  const status = normalizeStatus(
    profile.status ?? profile.accountStatus
  );

  return (
    profile.disabled === true ||
    profile.blocked === true ||
    status === "disabled" ||
    status === "blocked" ||
    status === "inactive" ||
    status === "suspended"
  );
}


function getConfigurationError(): {
  message: string;
  errorCode: string;
} | null {
  const status = getFirebaseAdminConfigurationStatus();

  if (!status.projectId) {
    return {
      message:
        "Vercel is missing FIREBASE_ADMIN_PROJECT_ID. Add it in Project Settings > Environment Variables, then redeploy.",
      errorCode: "missing-admin-project-id",
    };
  }

  if (!status.databaseURL) {
    return {
      message:
        "Vercel is missing FIREBASE_ADMIN_DATABASE_URL. Add it in Project Settings > Environment Variables, then redeploy.",
      errorCode: "missing-admin-database-url",
    };
  }

  if (!status.clientEmail) {
    return {
      message:
        "Vercel is missing FIREBASE_ADMIN_CLIENT_EMAIL. Add it in Project Settings > Environment Variables, then redeploy.",
      errorCode: "missing-admin-client-email",
    };
  }

  if (!status.privateKey) {
    return {
      message:
        "Vercel is missing FIREBASE_ADMIN_PRIVATE_KEY. Add the complete service-account private key, then redeploy.",
      errorCode: "missing-admin-private-key",
    };
  }

  if (!status.privateKeyFormat) {
    return {
      message:
        "FIREBASE_ADMIN_PRIVATE_KEY has an invalid format. It must include BEGIN PRIVATE KEY and END PRIVATE KEY, with \n line breaks preserved.",
      errorCode: "invalid-admin-private-key-format",
    };
  }

  return null;
}

function getPublicFirebaseError(
  code: string,
  message: string
) {
  const normalized = `${code} ${message}`.toLowerCase();

  if (
    normalized.includes("failed to parse private key") ||
    normalized.includes("invalid pem") ||
    normalized.includes("private key")
  ) {
    return {
      message:
        "FIREBASE_ADMIN_PRIVATE_KEY could not be parsed on Vercel. Paste the complete key and preserve its \n line breaks, then redeploy.",
      errorCode: "invalid-admin-private-key",
    };
  }

  if (
    normalized.includes("incorrect audience") ||
    normalized.includes("audience") ||
    normalized.includes("project id")
  ) {
    return {
      message:
        "The Firebase browser project and Firebase Admin project do not match. Verify that both project IDs are isda-go, then redeploy.",
      errorCode: "firebase-project-mismatch",
    };
  }

  if (
    normalized.includes("permission_denied") ||
    normalized.includes("permission denied")
  ) {
    return {
      message:
        "Firebase Admin connected, but access to Realtime Database was denied. Verify the service account and database URL.",
      errorCode: "admin-database-permission-denied",
    };
  }

  if (
    normalized.includes("invalid credential") ||
    normalized.includes("invalid-credential") ||
    normalized.includes("credential")
  ) {
    return {
      message:
        "The Firebase Admin service-account credentials configured in Vercel are invalid. Replace the client email and private key, then redeploy.",
      errorCode: "invalid-admin-credential",
    };
  }

  return {
    message:
      "Firebase Admin verification failed on Vercel. Check the server environment variables and deployment logs.",
    errorCode: code || "firebase-admin-verification-failed",
  };
}

function readBearerToken(
  request: NextRequest
): string | null {
  const authorization =
    request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] =
    authorization.trim().split(/\s+/, 2);

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token
  ) {
    return null;
  }

  return token;
}

function getSafeErrorDetails(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null
  ) {
    const possibleError = error as {
      code?: unknown;
      message?: unknown;
    };

    return {
      code:
        typeof possibleError.code === "string"
          ? possibleError.code
          : "unknown",
      message:
        typeof possibleError.message === "string"
          ? possibleError.message
          : "Unknown Firebase Admin error.",
    };
  }

  return {
    code: "unknown",
    message: String(error),
  };
}

export async function POST(
  request: NextRequest
) {
  try {
    const configurationError = getConfigurationError();

    if (configurationError) {
      return jsonResponse(
        {
          authorized: false,
          ...configurationError,
        },
        500
      );
    }

    if (!hasConfiguredAdminEmails()) {
      return jsonResponse(
        {
          authorized: false,
          message:
            "Vercel is missing FIREBASE_ADMIN_EMAILS. Add the exact Firebase Authentication admin email, then redeploy.",
          errorCode: "missing-admin-email-allowlist",
        },
        500
      );
    }

    const idToken = readBearerToken(request);

    if (!idToken) {
      return unauthorized(
        "A valid Firebase authentication token is required."
      );
    }

    const adminAuth = getAdminAuth();
    const adminDatabase = getAdminDatabase();

    /*
     * Verify the ID token through Firebase Admin.
     * The second argument is intentionally omitted while
     * configuring the project. You may change this to
     * verifyIdToken(idToken, true) later to check revocation.
     */
    const decodedToken =
      await adminAuth.verifyIdToken(idToken);

    const uid = decodedToken.uid;

    const email =
      decodedToken.email
        ?.trim()
        .toLowerCase() ?? "";

    if (!email) {
      return unauthorized(
        "The Firebase account does not contain an email address."
      );
    }

    if (!isAllowedAdminEmail(email)) {
      return unauthorized(
        "This email is not included in FIREBASE_ADMIN_EMAILS."
      );
    }

    const userRecord =
      await adminAuth.getUser(uid);

    if (userRecord.disabled) {
      return unauthorized(
        "This Firebase Authentication account is disabled."
      );
    }

    const profileReference =
      adminDatabase.ref(`users/${uid}`);

    const existingSnapshot =
      await profileReference.get();

    const existingValue =
      existingSnapshot.val();

    const existingProfile:
    ExistingAdminProfile =
      existingValue &&
      typeof existingValue === "object"
        ? existingValue
        : {};

    if (isBlockedProfile(existingProfile)) {
      return unauthorized(
        "This administrator profile is blocked or inactive."
      );
    }

    const existingClaims =
      userRecord.customClaims ?? {};

    await adminAuth.setCustomUserClaims(
      uid,
      {
        ...existingClaims,
        admin: true,
        role: "admin",
      }
    );

    const now = Date.now();

    const existingName =
      existingSnapshot.child("name").val();

    const existingDisplayName =
      existingSnapshot
        .child("displayName")
        .val();

    await profileReference.update({
      uid,
      name:
        userRecord.displayName ||
        (
          typeof existingName === "string"
            ? existingName
            : ""
        ) ||
        "IsdaGo Administrator",
      displayName:
        userRecord.displayName ||
        (
          typeof existingDisplayName ===
          "string"
            ? existingDisplayName
            : ""
        ) ||
        "IsdaGo Administrator",
      email,
      role: "admin",
      status: "active",
      accountStatus: "active",
      disabled: false,
      blocked: false,
      emailVerified:
        userRecord.emailVerified,
      createdAt:
        typeof existingProfile.createdAt ===
        "number"
          ? existingProfile.createdAt
          : now,
      updatedAt: now,
      lastAuthorizedAt: now,
    });

    return jsonResponse(
      {
        authorized: true,
        uid,
        email,
        role: "admin",
      },
      200
    );
  } catch (error) {
    const details =
      getSafeErrorDetails(error);

    console.error(
      "Admin authorization failed:",
      details.code,
      details.message
    );

    const publicError = getPublicFirebaseError(
      details.code,
      details.message
    );

    return jsonResponse(
      {
        authorized: false,
        ...publicError,
      },
      500
    );
  }
}
