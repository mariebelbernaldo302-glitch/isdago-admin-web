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
    if (!hasConfiguredAdminEmails()) {
      return jsonResponse(
        {
          authorized: false,
          message:
            "FIREBASE_ADMIN_EMAILS is missing or empty.",
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

    /*
     * Development receives a useful diagnostic.
     * Production keeps private configuration details hidden.
     */
    const isDevelopment =
      process.env.NODE_ENV !== "production";

    return jsonResponse(
      {
        authorized: false,
        message: isDevelopment
          ? `Admin verification failed: ${details.code} — ${details.message}`
          : "Admin verification failed. Check the Firebase Admin server configuration.",
        ...(isDevelopment
          ? {
              errorCode: details.code,
            }
          : {}),
      },
      500
    );
  }
}
