import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize channel URL for consistent lookup (handles trailing slash, origin variations) */
export function normalizeChannelUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/$/, "") || "/"
    return `https://www.youtube.com${path}`.toLowerCase()
  } catch {
    return url
  }
}
