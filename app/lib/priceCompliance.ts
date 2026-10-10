"use client";

import { getAuth } from "firebase/auth";
import { get, getDatabase, push, ref, update } from "firebase/database";

import { sendNotifications } from "./notificationFlow";
import { toNumber } from "./format";

export const COMPLIANCE_HOURS = 24;

export type MarketPrice = {
  id: string;
  name: string;
  price: number;
  unit?: string;
  notes?: string;
  updatedAt?: number;
  updatedBy?: string;
};

export type ComplianceStatus =
  | "pending"
  | "complied"
  | "expired"
  | "reenabled";

export type PriceComplianceCase = {
  id: string;
  productId: string;
  productName: string;
  vendorId: string;
  vendorName: string;
  marketPrice: number;
  vendorPriceAtNotice: number;
  unit?: string;
  deadlineAt: number;
  status: ComplianceStatus;
  notifiedAt: number;
  disabledAt?: number;
  reenabledAt?: number;
  reenabledBy?: string;
  createdAt: number;
  updatedAt: number;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findMarketPrice(
  marketPrices: MarketPrice[],
  productName: string,
): MarketPrice | null {
  const key = normalizeName(productName);
  if (!key) return null;
  return (
    marketPrices.find((m) => normalizeName(m.name) === key) || null
  );
}

export function isOverMarket(vendorPrice: number, marketPrice: number) {
  return marketPrice > 0 && vendorPrice > marketPrice;
}

export async function saveMarketPrice(input: {
  id?: string;
  name: string;
  price: number;
  unit?: string;
  notes?: string;
}): Promise<string> {
  const database = getDatabase();
  const name = input.name.trim();
  const price = toNumber(input.price, 0);
  if (!name || price <= 0) {
    throw new Error("Fish name and a valid market price are required.");
  }

  const now = Date.now();
  const adminUid = getAuth().currentUser?.uid || "admin";
  const id = input.id?.trim() || push(ref(database, "market_prices")).key;

  if (!id) throw new Error("Unable to create market price id.");

  const payload = {
    id,
    name,
    price,
    unit: (input.unit || "kg").trim() || "kg",
    notes: (input.notes || "").trim(),
    updatedAt: now,
    updatedBy: adminUid,
    createdAt: now,
  };

  await update(ref(database), {
    [`market_prices/${id}`]: payload,
  });

  return id;
}

export async function deleteMarketPrice(id: string) {
  const clean = id.trim();
  if (!clean) return;
  const database = getDatabase();
  await update(ref(database), {
    [`market_prices/${clean}`]: null,
  });
}

/**
 * Issue a 24-hour price compliance notice and notify the vendor.
 */
export async function issuePriceNotice(input: {
  productId: string;
  productName: string;
  vendorId: string;
  vendorName: string;
  vendorPrice: number;
  marketPrice: number;
  unit?: string;
}): Promise<string> {
  const database = getDatabase();
  const productId = input.productId.trim();
  const vendorId = input.vendorId.trim();
  const marketPrice = toNumber(input.marketPrice, 0);
  const vendorPrice = toNumber(input.vendorPrice, 0);

  if (!productId || !vendorId) {
    throw new Error("Product and vendor are required.");
  }
  if (!isOverMarket(vendorPrice, marketPrice)) {
    throw new Error("Vendor price is not above the market reference price.");
  }

  // Avoid duplicate pending cases for the same product
  const existingSnap = await get(ref(database, "price_compliance"));
  if (existingSnap.exists()) {
    const all = existingSnap.val() as Record<string, PriceComplianceCase>;
    for (const [caseId, c] of Object.entries(all || {})) {
      if (
        c &&
        c.productId === productId &&
        c.status === "pending"
      ) {
        throw new Error(
          `A pending notice already exists for this product (case ${caseId}).`,
        );
      }
    }
  }

  const now = Date.now();
  const deadlineAt = now + COMPLIANCE_HOURS * 60 * 60 * 1000;
  const caseId = push(ref(database, "price_compliance")).key;
  if (!caseId) throw new Error("Unable to create compliance case.");

  const unit = (input.unit || "kg").trim() || "kg";
  const productName = input.productName.trim() || "Seafood product";
  const vendorName = input.vendorName.trim() || "Vendor";

  const complianceCase: PriceComplianceCase = {
    id: caseId,
    productId,
    productName,
    vendorId,
    vendorName,
    marketPrice,
    vendorPriceAtNotice: vendorPrice,
    unit,
    deadlineAt,
    status: "pending",
    notifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Try to load product image for the automatic message card
  let productImageUrl = "";
  try {
    const productSnap = await get(ref(database, `products/${productId}`));
    if (productSnap.exists()) {
      const p = productSnap.val() as Record<string, unknown>;
      const raw =
        (typeof p.imageUrl === "string" && p.imageUrl) ||
        (typeof p.image === "string" && p.image) ||
        (typeof p.photoUrl === "string" && p.photoUrl) ||
        "";
      productImageUrl = String(raw).trim();
    }
  } catch {
    // non-fatal – message still works without image
  }

  const deadlineText = new Date(deadlineAt).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Build a clear automatic message from Admin → Vendor
  const autoMessageText =
    `⚠️ Price Notice – ${productName}\n\n` +
    `Your current price: ₱${vendorPrice.toLocaleString("en-PH")} / ${unit}\n` +
    `Minimum / market price: ₱${marketPrice.toLocaleString("en-PH")} / ${unit}\n` +
    `Difference: +₱${(vendorPrice - marketPrice).toLocaleString("en-PH")}\n\n` +
    `Please adjust the price to ₱${marketPrice.toLocaleString("en-PH")} or below within 24 hours (by ${deadlineText}).\n` +
    `If the price is not lowered in time, this product will be disabled automatically.\n\n` +
    `You can reply to this message if you need clarification or have a valid reason.`;

  // Create the automatic admin message in the chat thread
  const msgId = push(ref(database, "price_compliance_messages")).key;
  if (!msgId) throw new Error("Unable to create automatic message id.");

  const autoMessage: ComplianceMessage = {
    id: msgId,
    caseId,
    productId,
    productName,
    vendorId,
    vendorName,
    message: autoMessageText,
    senderRole: "admin",
    createdAt: now,
    status: "sent",
    productImageUrl: productImageUrl || undefined,
    marketPrice,
    vendorPriceAtNotice: vendorPrice,
    unit,
    deadlineAt,
    isAutomaticNotice: true,
  };

  await update(ref(database), {
    [`price_compliance/${caseId}`]: complianceCase,
    [`products/${productId}/priceComplianceCaseId`]: caseId,
    [`products/${productId}/priceComplianceStatus`]: "pending",
    [`products/${productId}/priceComplianceDeadlineAt`]: deadlineAt,
    [`products/${productId}/updatedAt`]: now,
    // Automatic chat message so it appears in Admin Messages + vendor can reply
    [`price_compliance_messages/${msgId}`]: autoMessage,
    [`price_compliance/${caseId}/lastVendorMessageAt`]: now,
  });

  // Still send push notification so vendor is alerted immediately
  await sendNotifications(
    [
      {
        id: vendorId,
        role: "vendor",
        name: vendorName,
      },
    ],
    {
      title: `Price notice: ${productName}`,
      message:
        `Your listing "${productName}" is priced above the market price of ₱${marketPrice.toLocaleString("en-PH")} / ${unit}. ` +
        `Please adjust within 24 hours. Open the message to reply to admin.`,
      type: "price_compliance",
      category: "price",
      severity: "warning",
      actionType: "message_admin_price",
      actionId: caseId,
      actionRoute: "price_compliance",
      orderId: productId,
    },
  );

  return caseId;
}

/**
 * Enforce expired pending cases: disable product if still over market.
 * Also mark complied if vendor already lowered the price.
 */
export async function enforceExpiredComplianceCases(
  marketPrices: MarketPrice[],
): Promise<{ disabled: number; complied: number }> {
  const database = getDatabase();
  const casesSnap = await get(ref(database, "price_compliance"));
  if (!casesSnap.exists()) return { disabled: 0, complied: 0 };

  const all = casesSnap.val() as Record<string, PriceComplianceCase>;
  const now = Date.now();
  let disabled = 0;
  let complied = 0;
  const updates: Record<string, unknown> = {};
  const notifyDisable: Array<{
    vendorId: string;
    vendorName: string;
    productName: string;
    productId: string;
  }> = [];

  for (const [caseId, c] of Object.entries(all || {})) {
    if (!c || c.status !== "pending") continue;

    const productSnap = await get(ref(database, `products/${c.productId}`));
    const product = productSnap.exists()
      ? (productSnap.val() as Record<string, unknown>)
      : null;
    const currentPrice = product
      ? toNumber(product.price, c.vendorPriceAtNotice)
      : c.vendorPriceAtNotice;

    const market =
      findMarketPrice(marketPrices, c.productName)?.price ?? c.marketPrice;

    // Vendor already complied before deadline
    if (!isOverMarket(currentPrice, market)) {
      updates[`price_compliance/${caseId}/status`] = "complied";
      updates[`price_compliance/${caseId}/updatedAt`] = now;
      updates[`products/${c.productId}/priceComplianceStatus`] = "complied";
      updates[`products/${c.productId}/updatedAt`] = now;
      complied += 1;
      continue;
    }

    // Still over market and past deadline → disable
    if (now >= c.deadlineAt) {
      updates[`price_compliance/${caseId}/status`] = "expired";
      updates[`price_compliance/${caseId}/disabledAt`] = now;
      updates[`price_compliance/${caseId}/updatedAt`] = now;
      updates[`products/${c.productId}/status`] = "inactive";
      updates[`products/${c.productId}/availability`] = "inactive";
      updates[`products/${c.productId}/available`] = false;
      updates[`products/${c.productId}/isAvailable`] = false;
      updates[`products/${c.productId}/priceComplianceStatus`] = "expired";
      updates[`products/${c.productId}/disabledReason`] = "price_over_market";
      updates[`products/${c.productId}/updatedAt`] = now;
      disabled += 1;
      notifyDisable.push({
        vendorId: c.vendorId,
        vendorName: c.vendorName,
        productName: c.productName,
        productId: c.productId,
      });
    }
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }

  for (const n of notifyDisable) {
    try {
      await sendNotifications(
        [{ id: n.vendorId, role: "vendor", name: n.vendorName }],
        {
          title: `Listing disabled: ${n.productName}`,
          message:
            `Your product "${n.productName}" was disabled because the price remained above the ` +
            `reference market price after the 24-hour compliance period. ` +
            `Lower the price to the market value (or below), then message the admin to request re-activation.`,
          type: "price_compliance",
          category: "price",
          severity: "critical",
          actionType: "open_products",
          actionId: n.productId,
          actionRoute: "vendor_products",
        },
      );
    } catch {
      // non-fatal
    }
  }

  return { disabled, complied };
}

/**
 * Admin re-enables a product after compliance (or override).
 */
export async function reenableProduct(input: {
  caseId: string;
  productId: string;
  vendorId: string;
  vendorName: string;
  productName: string;
  requireCompliantPrice?: boolean;
  marketPrice?: number;
}): Promise<void> {
  const database = getDatabase();
  const now = Date.now();
  const adminUid = getAuth().currentUser?.uid || "admin";

  if (input.requireCompliantPrice !== false && input.marketPrice != null) {
    const productSnap = await get(ref(database, `products/${input.productId}`));
    if (productSnap.exists()) {
      const price = toNumber(
        (productSnap.val() as Record<string, unknown>).price,
        0,
      );
      if (isOverMarket(price, input.marketPrice)) {
        throw new Error(
          "Product price is still above market. Vendor must lower the price first, or use override.",
        );
      }
    }
  }

  const updates: Record<string, unknown> = {
    [`products/${input.productId}/status`]: "active",
    [`products/${input.productId}/availability`]: "active",
    [`products/${input.productId}/available`]: true,
    [`products/${input.productId}/isAvailable`]: true,
    [`products/${input.productId}/priceComplianceStatus`]: "reenabled",
    [`products/${input.productId}/disabledReason`]: null,
    [`products/${input.productId}/updatedAt`]: now,
    [`price_compliance/${input.caseId}/status`]: "reenabled",
    [`price_compliance/${input.caseId}/reenabledAt`]: now,
    [`price_compliance/${input.caseId}/reenabledBy`]: adminUid,
    [`price_compliance/${input.caseId}/updatedAt`]: now,
  };

  await update(ref(database), updates);

  await sendNotifications(
    [
      {
        id: input.vendorId,
        role: "vendor",
        name: input.vendorName,
      },
    ],
    {
      title: `Listing re-enabled: ${input.productName}`,
      message:
        `Your product "${input.productName}" has been re-enabled by the administrator. ` +
        `Please keep prices at or below the reference market price.`,
      type: "price_compliance",
      category: "price",
      severity: "success",
      actionType: "open_products",
      actionId: input.productId,
      actionRoute: "vendor_products",
    },
  );
}

/**
 * Mark case complied when vendor price is already OK (manual admin action).
 */
export async function markCaseComplied(caseId: string, productId: string) {
  const database = getDatabase();
  const now = Date.now();
  await update(ref(database), {
    [`price_compliance/${caseId}/status`]: "complied",
    [`price_compliance/${caseId}/updatedAt`]: now,
    [`products/${productId}/priceComplianceStatus`]: "complied",
    [`products/${productId}/updatedAt`]: now,
  });
}


export type ComplianceMessage = {
  id: string;
  caseId: string;
  productId: string;
  productName: string;
  vendorId: string;
  vendorName: string;
  message: string;
  senderRole: "vendor" | "admin";
  createdAt: number;
  status?: string;
  /** Optional rich fields for automatic price notices */
  productImageUrl?: string;
  marketPrice?: number;
  vendorPriceAtNotice?: number;
  unit?: string;
  deadlineAt?: number;
  isAutomaticNotice?: boolean;
};

/**
 * Admin reply to vendor about a compliance case (uses existing notifications).
 */
export async function replyToVendorAboutPrice(input: {
  caseId: string;
  vendorId: string;
  vendorName: string;
  productName: string;
  productId: string;
  message: string;
}): Promise<void> {
  const database = getDatabase();
  const now = Date.now();
  const adminUid = getAuth().currentUser?.uid || "admin";
  const text = input.message.trim();
  if (!text) throw new Error("Message is required.");

  const msgId = push(ref(database, "price_compliance_messages")).key;
  if (!msgId) throw new Error("Unable to create message id.");

  const payload: ComplianceMessage = {
    id: msgId,
    caseId: input.caseId,
    productId: input.productId,
    productName: input.productName,
    vendorId: input.vendorId,
    vendorName: input.vendorName,
    message: text,
    senderRole: "admin",
    createdAt: now,
    status: "sent",
  };

  await update(ref(database), {
    [`price_compliance_messages/${msgId}`]: payload,
    [`price_compliance/${input.caseId}/lastVendorMessageAt`]: now,
    [`price_compliance/${input.caseId}/updatedAt`]: now,
  });

  await sendNotifications(
    [{ id: input.vendorId, role: "vendor", name: input.vendorName }],
    {
      title: `Admin reply: ${input.productName}`,
      message: text,
      type: "price_compliance",
      category: "price",
      severity: "info",
      actionType: "message_admin_price",
      actionId: input.caseId,
      orderId: input.productId,
    },
  );
}
