import moment from "moment-jalaali";

moment.loadPersian({ dialect: "persian-modern", usePersianDigits: true });

export function formatJalali(value, pattern = "dddd، jD jMMMM jYYYY") {
  const date = moment(value);
  return date.isValid() ? date.clone().locale("en").format(pattern.replace("،", ",")).toLowerCase() : "";
}

export function formatReminderTime(value) {
  const time = moment(value);
  if (!time.isValid()) return "";
  return time.clone().locale("en").format("h:mm A");
}

export function setReminderPeriod(value, period) {
  const time = moment(value).clone();
  const hour = time.hour() % 12;
  return time.hour(hour + (period === "PM" ? 12 : 0));
}

export function toStorageDate(value) {
  return value.clone().locale("en").format("YYYY-MM-DD");
}

export { moment };
