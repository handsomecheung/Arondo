"use client";

// Clicking anywhere in a datetime-local input — including the hour/minute
// segments, which browsers otherwise treat as inline spinners — opens the
// full native picker instead, so every click gets the same edit UI.
export function openDatetimePicker(e: React.MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    input.showPicker?.();
  } catch {
    /* unsupported or already open — ignore */
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Midnight of the current local day, as an <input type="date"> value —
// used as `min` so today's date stays pickable.
function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Default value a schedule picker opens with — an hour from now.
export function defaultScheduleTime(): number {
  return Date.now() + 60 * 60 * 1000;
}

// Separate date + time inputs (rather than one <input type="datetime-local">)
// so clicking the time segment opens only the native time picker — a single
// combined input always opens the full date+time picker regardless of which
// segment was clicked.
export function ScheduleDateTimeInputs({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const d = value ? new Date(value) : null;
  const dateStr = d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : "";
  const timeStr = d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "";

  const commit = (nextDateStr: string, nextTimeStr: string) => {
    if (!nextDateStr || !nextTimeStr) {
      onChange(null);
      return;
    }
    const [y, mo, da] = nextDateStr.split("-").map(Number);
    const [h, mi] = nextTimeStr.split(":").map(Number);
    onChange(new Date(y, mo - 1, da, h, mi).getTime());
  };

  return (
    <div className="schedule-datetime-fields">
      <input
        type="date"
        className="draft-schedule-input"
        value={dateStr}
        min={todayDateStr()}
        onChange={(e) => commit(e.target.value, timeStr || "00:00")}
        onClick={openDatetimePicker}
      />
      <input
        type="time"
        className="draft-schedule-input"
        value={timeStr}
        onChange={(e) => commit(dateStr || todayDateStr(), e.target.value)}
        onClick={openDatetimePicker}
      />
    </div>
  );
}
