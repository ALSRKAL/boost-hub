import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "plus"
  | "list"
  | "receipt"
  | "wallet"
  | "bank"
  | "users"
  | "search"
  | "chevron-down"
  | "chevron-right"
  | "chevron-left"
  | "arrow-up-right"
  | "copy"
  | "check"
  | "x"
  | "clock"
  | "refresh"
  | "menu"
  | "logout"
  | "external"
  | "info"
  | "alert"
  | "eye"
  | "eye-off"
  | "link"
  | "trash"
  | "shield"
  | "filter"
  | "user"
  | "message";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  title?: string;
}

const paths: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="4" rx="1" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  list: (
    <>
      <path d="M8.5 6h11M8.5 12h11M8.5 18h11" />
      <circle cx="4.5" cy="6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path d="M4 8h13" />
      <path d="M16.5 12.5h.01" strokeWidth="2.6" />
    </>
  ),
  bank: (
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M5.5 9.5v8M9.5 9.5v8M14.5 9.5v8M18.5 9.5v8" />
      <path d="M3.5 20h17" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.1 2.5-5.2 5.5-5.2s5.5 2.1 5.5 5.2" />
      <path d="M15.5 5.2a3 3 0 0 1 0 5.6M17 14.9c2 .5 3.5 2.2 3.5 5.1" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.7-4.4L3.5 9" />
      <path d="M3.5 4.5V9H8" />
      <path d="M4 13a8 8 0 0 0 14.7 4.4l1.8-2.4" />
      <path d="M20.5 19.5V15H16" />
    </>
  ),
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  logout: (
    <>
      <path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M11 8 7 12l4 4M7 12h9" />
    </>
  ),
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="m19 5-7.5 7.5" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6.4 6.2 12 6.2 21.2 12 21.2 12 17.6 17.8 12 17.8 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.2 6.4A9.6 9.6 0 0 1 12 6.2c5.6 0 9.2 5.8 9.2 5.8a16 16 0 0 1-2.4 3.1" />
      <path d="M6.3 7.7A16.6 16.6 0 0 0 2.8 12S6.4 17.8 12 17.8a9.5 9.5 0 0 0 3.6-.7" />
      <path d="M10 10a2.8 2.8 0 0 0 4 4" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9 6.5V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8v1.7" />
      <path d="M6.5 6.5 7.4 20h9.2l.9-13.5" />
      <path d="M10.5 10v6M13.5 10v6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-2.5Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5 20c0-3.6 3.1-5.8 7-5.8s7 2.2 7 5.8" />
    </>
  ),
  message: (
    <>
      <path d="M4 5.5h16v10.5H9.5L5 19.5v-3.5H4V5.5Z" />
      <path d="M8 10h8M8 13.2h5" />
    </>
  ),
};

export default function Icon({
  name,
  size = 16,
  title,
  className,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {paths[name]}
    </svg>
  );
}
