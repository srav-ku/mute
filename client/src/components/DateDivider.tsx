import { format, isToday, isYesterday } from "date-fns";

interface DateDividerProps {
  timestamp: number;
}

export function DateDivider({ timestamp }: DateDividerProps) {
  if (!timestamp || isNaN(timestamp)) {
    return null;
  }
  
  const date = new Date(timestamp);
  
  if (isNaN(date.getTime())) {
    return null;
  }
  
  let dateText = format(date, "MMMM d, yyyy");
  if (isToday(date)) {
    dateText = "Today";
  } else if (isYesterday(date)) {
    dateText = "Yesterday";
  }

  return (
    <div className="flex items-center justify-center my-6">
      <div className="px-4 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground font-medium">
        {dateText}
      </div>
    </div>
  );
}
