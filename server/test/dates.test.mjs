import test from "node:test";
import assert from "node:assert/strict";
import { formatJalali, formatReminderTime, moment, toStorageDate } from "../web/src/dates.mjs";

test("formats interface dates in Jalali with Persian text and digits", () => {
  assert.equal(formatJalali("2026-10-06T00:00:00Z"), "سه‌شنبه، ۱۴ مهر ۱۴۰۵");
});

test("makes the reminder period explicit", () => {
  assert.match(formatReminderTime(moment("2026-10-06T17:30:00").locale("fa")), /بعدازظهر \(PM\)$/);
  assert.match(formatReminderTime(moment("2026-10-06T09:30:00").locale("fa")), /قبل‌ازظهر \(AM\)$/);
});

test("keeps persisted API dates in Gregorian ASCII", () => {
  assert.equal(toStorageDate(moment("2026-10-06", "YYYY-MM-DD")), "2026-10-06");
});
