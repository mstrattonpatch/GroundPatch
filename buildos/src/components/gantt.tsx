import type { ProgrammeTask } from "@/lib/domain/types";

// Lookahead chart. Bars show the current forecast; the thin grey line under
// each bar is the baseline, so slippage is visible without a second chart.

function dayIndex(iso: string, start: Date) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - start.getTime()) / 86_400_000);
}

export function taskTone(t: ProgrammeTask): { color: string; label: string } {
  if (t.status === "blocked") return { color: "var(--red)", label: "blocked" };
  if (t.status === "complete") return { color: "#9fb8ab", label: "complete" };
  if (t.forecastFinish > t.baselineFinish) return { color: "var(--amber)", label: "at risk" };
  if (t.status === "in_progress") return { color: "var(--green)", label: "in progress" };
  return { color: t.forecastStart <= new Date().toISOString().slice(0, 10) ? "var(--blue)" : "#c9cfc8", label: "starting" };
}

export function Gantt({ tasks, fromOffset = -2, days = 14 }: { tasks: ProgrammeTask[]; fromOffset?: number; days?: number }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + fromOffset);
  const cols = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekdays = cols.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  const pctOf = (i: number) => `${(Math.max(0, Math.min(days, i)) / days) * 100}%`;
  const todayIdx = -fromOffset;

  return (
    <div className="gantt" role="table" aria-label="Programme lookahead">
      <div />
      <div className="g-head" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
        {cols.map((d, i) => (
          <span key={i} data-today={i === todayIdx} style={{ visibility: weekdays.includes(d) ? "visible" : "hidden" }}>
            {d.toLocaleDateString("en-AU", { weekday: "narrow" })} {d.getDate()}
          </span>
        ))}
      </div>
      {tasks.map((t) => {
        const s = dayIndex(t.forecastStart, start);
        const f = dayIndex(t.forecastFinish, start) + 1;
        const bs = dayIndex(t.baselineStart, start);
        const bf = dayIndex(t.baselineFinish, start) + 1;
        const tone = taskTone(t);
        return (
          <div key={t.id} role="row" style={{ display: "contents" }}>
            <div className="g-name" role="cell" style={{ fontWeight: t.isMilestone ? 700 : 500 }} title={t.name}>{t.name}</div>
            <div className="g-track" role="cell" aria-label={`${t.name}: ${tone.label}`}>
              <span className="g-today" style={{ left: pctOf(todayIdx + 0.5) }} />
              {t.isMilestone ? (
                <span className="g-ms" style={{ left: `calc(${pctOf(s + 0.5)} - 6px)`, background: tone.color }} />
              ) : (
                <>
                  {f > 0 && s < days && <span className="g-bar" style={{ left: pctOf(s), width: `calc(${pctOf(f)} - ${pctOf(s)})`, background: tone.color }} />}
                  {bf > 0 && bs < days && <span className="g-base" style={{ left: pctOf(bs), width: `calc(${pctOf(bf)} - ${pctOf(bs)})` }} />}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GanttKey() {
  return (
    <div className="row wrap small muted" style={{ gap: 14, marginTop: 12 }}>
      <span className="row" style={{ gap: 5 }}><i className="key" style={{ background: "var(--green)" }} />In progress</span>
      <span className="row" style={{ gap: 5 }}><i className="key" style={{ background: "var(--amber)" }} />At risk (forecast past baseline)</span>
      <span className="row" style={{ gap: 5 }}><i className="key" style={{ background: "var(--blue)" }} />Starting</span>
      <span className="row" style={{ gap: 5 }}><i className="key" style={{ background: "var(--red)", width: 9, height: 9, transform: "rotate(45deg)" }} />Milestone blocked</span>
      <span className="row" style={{ gap: 5 }}><i className="key" style={{ background: "#c9cfc8", height: 3 }} />Baseline</span>
    </div>
  );
}
