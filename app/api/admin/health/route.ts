import {
  NextResponse,
} from "next/server";

import {
  getAdminAuth,
  getAdminDatabase,
  getFirebaseAdminConfigurationStatus,
} from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET() {
  /*
   * This diagnostic endpoint is intentionally unavailable
   * in production.
   */
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, {
      status: 404,
    });
  }

  const configuration =
    getFirebaseAdminConfigurationStatus();

  const allowlistConfigured = Boolean(
    process.env.FIREBASE_ADMIN_EMAILS
      ?.split(",")
      .map((email) => email.trim())
      .filter(Boolean)
      .length
  );

  try {
    const adminAuth = getAdminAuth();
    const adminDatabase =
      getAdminDatabase();

    /*
     * These operations verify that the service account can
     * communicate with both Authentication and Realtime Database.
     */
    await adminAuth.listUsers(1);

    await adminDatabase
      .ref("users")
      .limitToFirst(1)
      .get();

    return NextResponse.json(
      {
        ok: true,
        configuration,
        allowlistConfigured,
        authenticationConnection: true,
        databaseConnection: true,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const details =
      getSafeErrorDetails(error);

    console.error(
      "Firebase Admin health check failed:",
      details.code,
      details.message
    );

    return NextResponse.json(
      {
        ok: false,
        configuration,
        allowlistConfigured,
        authenticationConnection: false,
        databaseConnection: false,
        errorCode: details.code,
        errorMessage: details.message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
