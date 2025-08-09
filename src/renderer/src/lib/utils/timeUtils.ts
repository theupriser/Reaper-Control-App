/**
 * Time Utilities
 * Helper functions for time formatting and manipulation
 */

/**
 * Format time in seconds to MM:SS format
 * @param seconds - The time in seconds
 * @returns The formatted time string (MM:SS)
 */
export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return '--:--';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time in seconds to HH:MM:SS format for longer durations (omits hours if zero)
 * @param seconds - The time in seconds
 * @returns The formatted time string (HH:MM:SS or MM:SS)
 */
export function formatLongTime(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return '--:--';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  // Only include hours in the output if they are non-zero
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Format time difference since a given date
 * @param date - The date to calculate time difference from
 * @returns Formatted string representing time elapsed
 */
export function formatTimeSince(date: Date | null): string {
  if (!date) return 'N/A';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Convert to seconds
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }

  // Convert to minutes
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ${diffSec % 60}s ago`;
  }

  // Convert to hours
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour}h ${diffMin % 60}m ago`;
  }

  // Convert to days
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ${diffHour % 24}h ago`;
}

/**
 * Calculate duration between two time points with fallback handling
 * @param start - Start time in seconds
 * @param end - End time in seconds
 * @param fallback - Fallback value if calculation is impossible
 * @returns Calculated duration or fallback value
 */
export function calculateDuration(
  start: number | undefined,
  end: number | undefined,
  fallback: number = 0
): number {
  if (start === undefined || end === undefined) return fallback;
  if (end < start) return fallback; // Prevent negative durations

  return end - start;
}
