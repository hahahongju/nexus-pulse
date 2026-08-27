/**
 * Auto-scales Bytes/sec into B/s, KB/s, MB/s, GB/s, TB/s
 */
export function formatSpeed(bytesPerSec: number | undefined | null): string {
  if (bytesPerSec === undefined || bytesPerSec === null || isNaN(bytesPerSec) || bytesPerSec <= 0) {
    return '0.0 B/s';
  }
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  const k = 1024;
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  const idx = Math.max(0, Math.min(i, units.length - 1));
  const val = bytesPerSec / Math.pow(k, idx);
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[idx]}`;
}

/**
 * Auto-scales KB/sec into B/s, KB/s, MB/s, GB/s, TB/s
 */
export function formatKbSpeed(kbPerSec: number | undefined | null): string {
  if (kbPerSec === undefined || kbPerSec === null || isNaN(kbPerSec) || kbPerSec <= 0) {
    return '0.0 B/s';
  }
  return formatSpeed(kbPerSec * 1024);
}

/**
 * Auto-scales Bytes into B, KB, MB, GB, TB, PB
 */
export function formatBytes(bytes: number | undefined | null, decimals = 1): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.max(0, Math.min(i, units.length - 1));
  const val = bytes / Math.pow(k, idx);
  return `${val.toFixed(val >= 100 ? 0 : decimals)} ${units[idx]}`;
}
