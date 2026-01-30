"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateTimePickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  minDate?: Date
  className?: string
}

const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 12 }, (_, i) => i * 5)

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Round minute up to the next 5-minute slot */
function ceilMinute5(m: number) {
  return Math.ceil(m / 5) * 5
}

export function DateTimePicker({
  value,
  onChange,
  minDate,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selectedHour = value ? value.getHours() : 0
  const selectedMinute = value ? value.getMinutes() : 0

  // When the selected date is the same day as minDate, compute the
  // earliest allowed hour/minute so past time options are disabled.
  const isMinDay = !!(value && minDate && isSameDay(value, minDate))
  const minHour = isMinDay ? minDate!.getHours() : 0
  const minMinuteRaw = isMinDay ? minDate!.getMinutes() : 0
  // For the currently-selected hour, compute the earliest allowed minute
  const minMinute =
    isMinDay && selectedHour === minHour ? ceilMinute5(minMinuteRaw) : 0

  /** Clamp time forward when the selected day is minDate's day */
  function clampTime(date: Date, hour: number, minute: number) {
    if (minDate && isSameDay(date, minDate)) {
      if (hour < minDate.getHours()) {
        hour = minDate.getHours()
        minute = ceilMinute5(minDate.getMinutes())
      } else if (
        hour === minDate.getHours() &&
        minute < ceilMinute5(minDate.getMinutes())
      ) {
        minute = ceilMinute5(minDate.getMinutes())
      }
      // If clamped minute overflows to 60, bump the hour
      if (minute >= 60) {
        hour += 1
        minute = 0
      }
    }
    date.setHours(hour, minute, 0, 0)
    return date
  }

  function handleDateSelect(day: Date | undefined) {
    if (!day) return
    const next = clampTime(new Date(day), selectedHour, selectedMinute)
    onChange(next)
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = value ? new Date(value) : new Date()
    if (e.target.name === "hour") {
      clampTime(next, parseInt(e.target.value), selectedMinute)
    } else {
      clampTime(next, selectedHour, parseInt(e.target.value))
    }
    onChange(next)
  }

  const selectClass =
    "bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white outline-none focus:border-purple-500 focus:ring-purple-500/50 focus:ring-[3px]"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? format(value, "PPP 'at' HH:mm") : "Pick a date and time"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-gray-800 text-white border-gray-700"
        align="start"
      >
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDateSelect}
          disabled={minDate ? { before: minDate } : undefined}
          defaultMonth={value}
        />
        <div className="border-t border-gray-700 p-3 flex items-center gap-2">
          <span className="text-sm text-gray-400">Time:</span>
          <select
            name="hour"
            value={selectedHour}
            onChange={handleTimeChange}
            className={selectClass}
          >
            {hours.map((h) => (
              <option key={h} value={h} disabled={h < minHour}>
                {String(h).padStart(2, "0")}
              </option>
            ))}
          </select>
          <span className="text-gray-400 font-medium">:</span>
          <select
            name="minute"
            value={selectedMinute}
            onChange={handleTimeChange}
            className={selectClass}
          >
            {minutes.map((m) => (
              <option key={m} value={m} disabled={m < minMinute}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
