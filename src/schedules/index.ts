import type { ScheduleConfig } from "../types";

export function defineSchedule(config: ScheduleConfig): ScheduleConfig {
  if (!config.name || !config.cron || !config.handler) {
    throw new Error("Schedule must have name, cron, and handler");
  }
  return config;
}

export interface SchedulerHandle {
  stop: () => void;
}

export interface SchedulerOptions {
  intervalMs?: number;
}

function cronField(value: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  const parts = value.split(",");
  for (const part of parts) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      if (isNaN(step) || step <= 0) continue;
      for (let i = min; i <= max; i += step) result.add(i);
    } else if (part.includes("-")) {
      const [rawStart, rawEnd] = part.split("-");
      const start = parseInt(rawStart, 10);
      const end = parseInt(rawEnd, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) result.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) result.add(num);
    }
  }
  return result;
}

export function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minuteField, hourField, dayField, monthField, dowField] = fields;

  const minutes = cronField(minuteField, 0, 59);
  const hours = cronField(hourField, 0, 23);
  const days = cronField(dayField, 1, 31);
  const months = cronField(monthField, 1, 12);
  const daysOfWeek = cronField(dowField, 0, 6);

  return (
    minutes.has(date.getMinutes()) &&
    hours.has(date.getHours()) &&
    days.has(date.getDate()) &&
    months.has(date.getMonth() + 1) &&
    daysOfWeek.has(date.getDay())
  );
}

export function startScheduler(
  schedules: Record<string, ScheduleConfig>,
  options: SchedulerOptions = {},
): SchedulerHandle {
  const intervalMs = options.intervalMs ?? 60_000;
  const scheduleList = Object.values(schedules);
  if (scheduleList.length === 0) return { stop: () => {} };

  const timer = setInterval(async () => {
    const now = new Date();
    for (const schedule of scheduleList) {
      try {
        if (cronMatches(schedule.cron, now)) {
          await schedule.handler();
        }
      } catch (err) {
        console.warn(`[arcie] Schedule "${schedule.name}" failed:`, err);
      }
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
