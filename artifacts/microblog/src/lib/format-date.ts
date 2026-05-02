import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";

export function formatPostDate(dateString: string) {
  const date = new Date(dateString);
  
  if (isToday(date)) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  
  if (isYesterday(date)) {
    return `Yesterday at ${format(date, "h:mm a")}`;
  }
  
  return format(date, "MMM d, yyyy");
}
