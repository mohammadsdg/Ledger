import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { IconButton, Button } from '@mui/material';
import { moment, toStorageDate, formatJalali } from './dates.mjs';

export default function CalendarPanel({ value, onChange, tasks }) {
  const [month, setMonth] = useState(() => value.clone().startOf('jMonth'));
  useEffect(() => setMonth(value.clone().startOf('jMonth')), [value]);
  const start = month.clone().startOf('jMonth');
  const offset = (start.day() + 1) % 7;
  const count = start.clone().endOf('jMonth').jDate();
  const selected = toStorageDate(value), today = toStorageDate(moment());
  const marked = new Set(tasks.filter(t => !t.done).flatMap(t => [t.dueDate, t.myDay, t.reminderAt ? toStorageDate(moment(t.reminderAt)) : null]).filter(Boolean));
  function keyDown(event, date) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = date.clone().add(delta, 'day'); onChange(next);
    requestAnimationFrame(() => document.querySelector(`[data-calendar-date="${toStorageDate(next)}"]`)?.focus());
  }
  return <section className="calendarPanel" aria-label="Persian calendar">
    <header className="calendarToolbar">
      <IconButton aria-label="Previous month" onClick={() => setMonth(month.clone().subtract(1, 'jMonth'))}><ChevronLeft /></IconButton>
      <h2 aria-live="polite">{formatJalali(month, 'jMMMM jYYYY')}</h2>
      <IconButton aria-label="Next month" onClick={() => setMonth(month.clone().add(1, 'jMonth'))}><ChevronRight /></IconButton>
      <Button onClick={() => onChange(moment())}>Today</Button>
    </header>
    <div className="calendarGrid" role="group" aria-label={formatJalali(month, 'jMMMM jYYYY')}>
      {['Sat','Sun','Mon','Tue','Wed','Thu','Fri'].map(day => <span className="calendarWeekday" key={day}>{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const date = start.clone().add(i, 'day'), key = toStorageDate(date);
        return <button key={key} data-calendar-date={key} aria-label={formatJalali(date)} aria-pressed={key === selected} aria-current={key === today ? 'date' : undefined} className={`calendarDay ${key === selected ? 'selected' : ''} ${key === today ? 'today' : ''}`} onClick={() => onChange(date)} onKeyDown={e => keyDown(e,date)}>
          <span>{i + 1}</span>{marked.has(key) && <i aria-label="Has tasks" />}
        </button>;
      })}
    </div>
  </section>;
}
