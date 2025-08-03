/**
 * Date utility functions for the UOOP platform
 */

/**
 * Format a date to ISO string with timezone
 */
export function formatDateToISO(date: Date): string {
  return date.toISOString();
}

/**
 * Parse ISO string to Date object
 */
export function parseISOString(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Get current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Calculate time difference in minutes
 */
export function getTimeDifferenceInMinutes(date1: Date, date2: Date): number {
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Get date with time set to start of day (00:00:00)
 */
export function getStartOfDay(date: Date): Date {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

/**
 * Get date with time set to end of day (23:59:59)
 */
export function getEndOfDay(date: Date): Date {
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
} 