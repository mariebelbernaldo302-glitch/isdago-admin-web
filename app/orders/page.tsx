import { redirect } from "next/navigation";

/**
 * Order operations belong to the customer/vendor application workflow.
 * Administrators see order references only while investigating reports.
 */
export default function OrdersPage() {
  redirect("/reports");
}
