const DEFAULT_LOCALE = "en-PH";
const DEFAULT_CURRENCY = "PHP";
const DEFAULT_PLACEHOLDER = "-";

type DateInput =
  | string
  | number
  | Date
  | null
  | undefined
  | {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };

type MoneyFormatOptions = {
  currency?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  placeholder?: string;
};

type DateFormatOptions = {
  placeholder?: string;
  includeTime?: boolean;
};

function isValidDate(date: Date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

export function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const cleanedValue = value.replace(/[₱,\s]/g, "");
    const parsedValue = Number(cleanedValue);

    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  return fallback;
}

export function formatMoney(
  value: unknown,
  options: MoneyFormatOptions = {}
) {
  const {
    currency = DEFAULT_CURRENCY,
    maximumFractionDigits = 0,
    minimumFractionDigits = 0,
    placeholder = "₱0",
  } = options;

  const amount = toNumber(value, Number.NaN);

  if (!Number.isFinite(amount)) {
    return placeholder;
  }

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}

export function formatNumber(value: unknown, placeholder = "0") {
  const number = toNumber(value, Number.NaN);

  if (!Number.isFinite(number)) {
    return placeholder;
  }

  return new Intl.NumberFormat(DEFAULT_LOCALE).format(number);
}

export function toDate(value: DateInput): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === "number") {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);

    return isValidDate(date) ? date : null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    const numericValue = Number(trimmedValue);

    if (Number.isFinite(numericValue)) {
      return toDate(numericValue);
    }

    const date = new Date(trimmedValue);

    return isValidDate(date) ? date : null;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const date = value.toDate();

      return isValidDate(date) ? date : null;
    }

    if (typeof value.seconds === "number") {
      const milliseconds =
        value.seconds * 1000 +
        Math.floor((value.nanoseconds || 0) / 1_000_000);

      const date = new Date(milliseconds);

      return isValidDate(date) ? date : null;
    }
  }

  return null;
}

export function formatDate(
  value: DateInput,
  options: DateFormatOptions = {}
) {
  const { placeholder = DEFAULT_PLACEHOLDER, includeTime = false } = options;

  const date = toDate(value);

  if (!date) {
    return placeholder;
  }

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "numeric",
          minute: "2-digit",
        }
      : {}),
  }).format(date);
}

export function formatDateTime(value: DateInput, placeholder = DEFAULT_PLACEHOLDER) {
  return formatDate(value, {
    placeholder,
    includeTime: true,
  });
}

export function normalizeStatus(status?: string | null) {
  return String(status || "unknown")
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ");
}

export function formatStatusLabel(status?: string | null) {
  const normalizedStatus = normalizeStatus(status);

  return normalizedStatus
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getName(
  primary?: string | null,
  secondary?: string | null,
  fallback = "Not provided"
) {
  const primaryValue = primary?.trim();
  const secondaryValue = secondary?.trim();

  return primaryValue || secondaryValue || fallback;
}

export function getInitials(
  name?: string | null,
  email?: string | null,
  fallback = "AD"
) {
  const source = name?.trim() || email?.split("@")[0] || fallback;

  const parts = source
    .split(/[.\s_-]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function truncateText(value?: string | null, maxLength = 60) {
  if (!value) {
    return DEFAULT_PLACEHOLDER;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

export function formatPhone(value?: string | null) {
  if (!value?.trim()) {
    return DEFAULT_PLACEHOLDER;
  }

  return value.trim();
}