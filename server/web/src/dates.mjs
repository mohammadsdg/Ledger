import moment from "moment-jalaali";

moment.loadPersian({ dialect: "persian-modern", usePersianDigits: true });

export function formatJalali(value, pattern = "dddd، jD jMMMM jYYYY") {
  const date = moment(value);
  return date.isValid() ? date.format(pattern) : "";
}

export function formatReminderTime(value) {
  const time = moment(value);
  if (!time.isValid()) return "";
  const period = time.hour() < 12 ? "قبل‌ازظهر (AM)" : "بعدازظهر (PM)";
  return `${time.format("h:mm")} ${period}`;
}

export function toStorageDate(value) {
  return value.clone().locale("en").format("YYYY-MM-DD");
}

export { moment };
