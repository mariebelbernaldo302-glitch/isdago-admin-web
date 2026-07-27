import { redirect } from "next/navigation";

/**
 * Product administration is intentionally not exposed in the Trust & Safety
 * portal. Product information is retained in Firebase as investigation
 * evidence and vendor listings are deactivated through account enforcement.
 */
export default function ProductsPage() {
  redirect("/reports");
}
