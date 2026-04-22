/**
 * Date formatting utility functions
 */

/**
 * Format a date to a human-readable string
 * @param date - Date object or ISO string
 * @returns Formatted date string (e.g., "Apr 22, 2026 at 3:45 PM")
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  return d.toLocaleDateString('en-US', options);
}

/**
 * Format a date to a short date string
 * @param date - Date object or ISO string
 * @returns Formatted date string (e.g., "Apr 22, 2026")
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  return d.toLocaleDateString('en-US', options);
}

/**
 * Format a date to time only
 * @param date - Date object or ISO string
 * @returns Formatted time string (e.g., "3:45 PM")
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  return d.toLocaleTimeString('en-US', options);
}

/**
 * Get relative time from now (e.g., "2 hours ago")
 * @param date - Date object or ISO string
 * @returns Relative time string
 */
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return formatDateShort(d);
}
