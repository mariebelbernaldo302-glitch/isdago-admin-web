type IsdaGoLogoProps = {
  small?: boolean;
  className?: string;
  label?: string;
};

export default function IsdaGoLogo({
  small = false,
  className = "",
  label = "IsdaGo",
}: IsdaGoLogoProps) {
  const logoClassName = [
    small ? "brand-logo" : "login-logo",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={logoClassName} role="img" aria-label={`${label} logo`}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10 34C17.2 23.5 27.7 18 41 18c7.5 0 14 3.4 18 8.8C55 32.2 48.5 35.6 41 35.6c-13.3 0-23.8-5.5-31-16.1Z"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(0 6)"
        />

        <path
          d="M19.5 40.5C14.2 45.5 9.3 47.8 4 47.8c3.1-4.1 3.1-8.6 0-13.2 5.3 0 10.2 2.3 15.5 5.9Z"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle cx="43.5" cy="32.8" r="3" fill="currentColor" />

        <path
          d="M24.5 18.5C18.4 17.4 14.2 14.2 12 9c8.2.2 14.3 3.3 18.5 9.5"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M27.5 47.2C22.2 51.1 16.1 52.2 9.2 50.4c5.3-5.2 11.1-7.4 18.3-7.4"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M32 29.5c-3.5 2.7-7.1 4.2-10.8 4.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    </div>
  );
}