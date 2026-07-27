import { redirect } from "next/navigation";

/**
 * Transaction management is not part of this monitoring portal. Payment data
 * remains in Firebase and is never deleted when an account is restricted.
 */
export default function TransactionsPage() {
  redirect("/reports");
}
