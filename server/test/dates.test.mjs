import test from "node:test";
import assert from "node:assert/strict";
import { formatJalali, formatReminderTime, moment, setReminderPeriod, toStorageDate } from "../web/src/dates.mjs";

test("formats interface dates in Jalali with English text and digits", () => {
  assert.equal(formatJalali("2026-10-07T00:00:00Z"), "wednesday, 15 mehr 1405");
});

test("makes the reminder period explicit", () => {
  assert.equal(formatReminderTime(moment("2026-10-06T17:30:00").locale("fa")), "5:30 PM");
  assert.equal(formatReminderTime(moment("2026-10-06T09:30:00").locale("fa")), "9:30 AM");
});

test("switches reminder period while keeping the selected 12-hour time", () => {
  assert.equal(formatReminderTime(setReminderPeriod(moment("2026-10-06T00:30:00"), "PM")), "12:30 PM");
  assert.equal(formatReminderTime(setReminderPeriod(moment("2026-10-06T12:30:00"), "AM")), "12:30 AM");
  assert.equal(formatReminderTime(setReminderPeriod(moment("2026-10-06T09:15:00"), "PM")), "9:15 PM");
});

test("keeps persisted API dates in Gregorian ASCII", () => {
  assert.equal(toStorageDate(moment("2026-10-06", "YYYY-MM-DD")), "2026-10-06");
});
