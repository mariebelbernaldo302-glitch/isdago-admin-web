export type UserRole = "admin" | "vendor" | "customer";

export type TimestampValue = number | string | null | undefined;

export type NumericValue = number | string;

export type RealtimeRecord<T> = T & {
  id: string;
};

export type RealtimeMap<T> = Record<string, Omit<T, "id">>;

export type GeneralStatus =
  | "active"
  | "inactive"
  | "pending"
  | "approved"
  | "rejected"
  | "disabled"
  | "verified"
  | "unverified"
  | "completed"
  | "cancelled"
  | "failed"
  | "processing"
  | "unknown"
  | string;

export type ProductStatus =
  | "active"
  | "inactive"
  | "approved"
  | "pending"
  | "rejected"
  | "in stock"
  | "low stock"
  | "out of stock"
  | string;

export type OrderStatus =
  | "pending"
  | "accepted"
  | "processing"
  | "preparing"
  | "shipped"
  | "for delivery"
  | "delivered"
  | "completed"
  | "cancelled"
  | "failed"
  | string;

export type PaymentStatus =
  | "pending"
  | "paid"
  | "unpaid"
  | "failed"
  | "refunded"
  | "cancelled"
  | string;

export type PaymentMethod =
  | "cash on delivery"
  | "gcash"
  | "maya"
  | "bank transfer"
  | "cash"
  | string;

export type NotificationStatus =
  | "unread"
  | "read"
  | "new"
  | "order update"
  | "system"
  | string;

export type UserRecord = {
  id: string;
  uid?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  role?: UserRole | string;
  status?: GeneralStatus;
  moderationStatus?: GeneralStatus;
  moderationReasonCode?: string;
  moderationReason?: string;
  moderationDetails?: string;
  moderationMessage?: string;
  moderatedAt?: TimestampValue;
  suspendedAt?: TimestampValue;
  suspendedUntil?: TimestampValue;
  suspensionDays?: NumericValue;
  disabledAt?: TimestampValue;
  photo?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  lastLoginAt?: TimestampValue;
};

export type Customer = {
  id: string;
  uid?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  address?: string;
  barangay?: string;
  city?: string;
  province?: string;
  description?: string;
  status?: GeneralStatus;
  moderationStatus?: GeneralStatus;
  moderationReasonCode?: string;
  moderationReason?: string;
  moderationDetails?: string;
  moderationMessage?: string;
  moderatedAt?: TimestampValue;
  suspendedAt?: TimestampValue;
  suspendedUntil?: TimestampValue;
  suspensionDays?: NumericValue;
  disabledAt?: TimestampValue;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  dateRegistered?: string;
};

export type Vendor = {
  id: string;
  uid?: string;
  businessName?: string;
  storeName?: string;
  vendorName?: string;
  name?: string;
  owner?: string;
  ownerName?: string;
  email?: string;
  contact?: string;
  phone?: string;
  location?: string;
  address?: string;
  barangay?: string;
  city?: string;
  province?: string;
  description?: string;
  status?: GeneralStatus;
  moderationStatus?: GeneralStatus;
  moderationReasonCode?: string;
  moderationReason?: string;
  moderationDetails?: string;
  moderationMessage?: string;
  moderatedAt?: TimestampValue;
  suspendedAt?: TimestampValue;
  suspendedUntil?: TimestampValue;
  suspensionDays?: NumericValue;
  disabledAt?: TimestampValue;
  applicationStatus?: GeneralStatus;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  approvedAt?: TimestampValue;
  rejectedAt?: TimestampValue;
  dateRegistered?: string;
  dateApplied?: string;
  documents?: string[] | Record<string, string>;
  permitImage?: string;
  validIdImage?: string;
  businessImage?: string;
};

export type VendorApplication = {
  id: string;
  uid?: string;
  vendorId?: string;
  businessName?: string;
  storeName?: string;
  ownerName?: string;
  owner?: string;
  name?: string;
  vendorName?: string;
  email?: string;
  phone?: string;
  contact?: string;
  address?: string;
  location?: string;
  barangay?: string;
  city?: string;
  province?: string;
  description?: string;
  status?: GeneralStatus;
  applicationStatus?: GeneralStatus;
  remarks?: string;
  rejectionReason?: string;
  documents?: string[] | Record<string, string>;
  permitImage?: string;
  validIdImage?: string;
  businessImage?: string;
  submittedAt?: TimestampValue;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  reviewedAt?: TimestampValue;
  reviewedBy?: string;
  approvedAt?: TimestampValue;
  rejectedAt?: TimestampValue;
  dateApplied?: string;
};

export type Category = {
  id: string;
  name?: string;
  description?: string;
  status?: GeneralStatus;
  image?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
};

export type Product = {
  id: string;
  vendorId?: string;
  vendorName?: string;
  categoryId?: string;
  category?: string;
  name?: string;
  productName?: string;
  description?: string;
  price?: NumericValue;
  stock?: NumericValue;
  unit?: string;
  availability?: ProductStatus;
  status?: ProductStatus;
  image?: string;
  imageBase64?: string;
  imageUrl?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
};

export type CartItem = {
  id: string;
  customerId?: string;
  productId?: string;
  vendorId?: string;
  productName?: string;
  vendorName?: string;
  quantity?: NumericValue;
  price?: NumericValue;
  subtotal?: NumericValue;
  image?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
};

export type OrderItem = {
  id?: string;
  productId?: string;
  vendorId?: string;
  productName?: string;
  name?: string;
  category?: string;
  quantity?: NumericValue;
  price?: NumericValue;
  subtotal?: NumericValue;
  image?: string;
};

export type Order = {
  id: string;
  orderId?: string;
  customerId?: string;
  customerName?: string;
  customer?: string;
  customerEmail?: string;
  customerPhone?: string;
  vendorId?: string;
  vendorName?: string;
  vendor?: string;
  products?: string;
  items?: OrderItem[] | Record<string, OrderItem>;
  total?: NumericValue;
  amount?: NumericValue;
  deliveryFee?: NumericValue;
  grandTotal?: NumericValue;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  payment?: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  acceptedAt?: TimestampValue;
  completedAt?: TimestampValue;
  cancelledAt?: TimestampValue;
  date?: string;
};

export type Transaction = {
  id: string;
  transactionId?: string;
  orderId?: string;
  customerId?: string;
  customerName?: string;
  customer?: string;
  vendorId?: string;
  vendorName?: string;
  vendor?: string;
  amount?: NumericValue;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  status?: PaymentStatus;
  referenceNumber?: string;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  date?: string;
};

export type NotificationRecord = {
  id: string;
  title?: string;
  message?: string;
  type?: string;
  target?: string;
  targetUsers?: string | string[];
  userId?: string;
  vendorId?: string;
  customerId?: string;
  orderId?: string;
  productId?: string;
  status?: NotificationStatus;
  read?: boolean;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  date?: string;
};

export type ActivityLog = {
  id: string;
  type?: string;
  action?: string;
  module?: string;
  description?: string;
  user?: string;
  userId?: string;
  role?: UserRole | string;
  metadata?: Record<string, unknown>;
  createdAt?: TimestampValue;
  updatedAt?: TimestampValue;
  timestamp?: string;
};

export type AdminSettings = {
  id?: string;
  marketplaceName?: string;
  supportEmail?: string;
  supportPhone?: string;
  defaultDeliveryFee?: NumericValue;
  minimumOrderAmount?: NumericValue;
  maintenanceMode?: boolean;
  allowVendorRegistration?: boolean;
  allowCustomerRegistration?: boolean;
  updatedAt?: TimestampValue;
};

export type DashboardStats = {
  totalCustomers: number;
  totalVendors: number;
  pendingVendorApprovals: number;
  totalProducts: number;
  totalOrders: number;
  totalTransactions: number;
  totalSales: number;
  unreadNotifications: number;
};

export type SelectOption = {
  label: string;
  value: string;
};

export type TableColumn<T> = {
  key: keyof T | string;
  label: string;
  render?: (item: T) => React.ReactNode;
};