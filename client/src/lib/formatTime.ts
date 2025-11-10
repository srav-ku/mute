import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  
  if (isToday(date)) {
    return format(date, "h:mm a");
  } else if (isYesterday(date)) {
    return `Yesterday ${format(date, "h:mm a")}`;
  } else {
    const now = Date.now();
    const daysDiff = Math.floor((now - timestamp) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < 7) {
      return format(date, "EEEE h:mm a");
    } else if (daysDiff < 365) {
      return format(date, "MMM d, h:mm a");
    } else {
      return format(date, "MMM d, yyyy h:mm a");
    }
  }
}

export function formatRelativeTime(timestamp: number): string {
  return formatDistanceToNow(timestamp, { addSuffix: true });
}
