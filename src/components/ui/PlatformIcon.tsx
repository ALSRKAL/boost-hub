import type { PlatformKey } from "@/lib/service-platforms";

export default function PlatformIcon({
  platform,
  className = "h-5 w-5",
}: {
  platform: PlatformKey;
  className?: string;
}) {
  switch (platform) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M13.2 20v-6.3h2.3l.3-2.7h-2.6V9.2c0-.8.2-1.4 1.4-1.4H16V5.4c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.4V11H8.7v2.7H11V20h2.2Z" fill="currentColor" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M14 4c.6 2 1.8 3.3 4 3.7v2.4c-1.5 0-2.9-.4-4-1.1v5.7a4.6 4.6 0 1 1-4.6-4.6c.3 0 .7 0 1 .1v2.5a2.1 2.1 0 1 0 1.1 1.9V4H14Z" fill="currentColor" />
        </svg>
      );
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="m20 5-2.7 12.7c-.2.9-.8 1.1-1.6.7l-4.4-3.2-2.1 2c-.2.2-.4.4-.8.4l.3-4.6L17.2 7c.4-.3-.1-.5-.6-.2l-10.2 6.4-4.4-1.4c-1-.3-1-.9.2-1.4L18.8 4c.8-.3 1.4.2 1.2 1Z" fill="currentColor" />
        </svg>
      );
    case "twitter":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M4 4h4.2l3.4 4.8L15.7 4H20l-6.2 7.3L20.5 20h-4.2l-3.8-5.4L8 20H3.6l6.7-7.8L4 4Z" fill="currentColor" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 4a8 8 0 0 0-6.9 12L4 20l4.2-1.1A8 8 0 1 0 12 4Zm4.5 11.2c-.2.6-1.3 1.1-1.7 1.1-.4 0-.9.1-3-.7-2.5-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5 0-1.2.6-1.8.9-2.1.3-.3.7-.4.9-.4h.7c.2 0 .5 0 .7.5l.9 2c.1.2.1.5 0 .7l-.4.6c-.2.2-.3.4-.1.7.2.4.8 1.3 1.8 2 .4.3.8.5 1.1.2.4-.4.8-.9 1-.9.2 0 .4 0 .7.2l1.8.8c.3.1.5.2.6.4.1.2.1 1 0 1.3Z" fill="currentColor" />
        </svg>
      );
    case "snapchat":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 4.5c2.8 0 4.7 2 4.7 4.7v2c0 .4.2.8.6 1 .6.3 1.2.5 1.2 1s-.7.8-1.3 1a2 2 0 0 0-1.3 1.2c-.3.7-.9 1.1-1.8 1.1-.3.8-1 1.5-2.1 1.5s-1.8-.7-2.1-1.5c-.9 0-1.5-.4-1.8-1.1a2 2 0 0 0-1.3-1.2c-.6-.2-1.3-.5-1.3-1s.6-.7 1.2-1c.4-.2.6-.6.6-1v-2C7.3 6.5 9.2 4.5 12 4.5Z" stroke="currentColor" strokeWidth="1.8" fill="none" />
        </svg>
      );
    case "spotify":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.2 10.2c2.8-1 5.8-.8 8.2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.9 12.9c2.2-.7 4.5-.5 6.3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9.8 15.4c1.5-.4 3.1-.3 4.4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.2 10.1v5.7M8.2 8.3h0M11.4 10.1v5.7m0-3c0-1.5 1-2.7 2.3-2.7 1.5 0 2.1 1 2.1 2.7v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M8 8.5c2.2-1 5.8-1 8 0 .7 1.2 1.2 2.4 1.5 3.7-.9.8-2 1.4-3.2 1.7l-.7-1c-.4.1-.9.2-1.4.2s-1 0-1.4-.2l-.7 1A8.8 8.8 0 0 1 6.5 12c.3-1.3.8-2.5 1.5-3.7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="10" cy="11.2" r="1" fill="currentColor" />
          <circle cx="14" cy="11.2" r="1" fill="currentColor" />
        </svg>
      );
    case "website":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.5 9h15M4.5 15h15M12 4.2c2 2.2 3.1 5 3.1 7.8 0 2.8-1.1 5.6-3.1 7.8-2-2.2-3.1-5-3.1-7.8 0-2.8 1.1-5.6 3.1-7.8Z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}
