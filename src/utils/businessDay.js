// src/utils/businessDay.js
// ============================================================
// اليوم التجاري الموحّد بتوقيت القاهرة (Africa/Cairo)
// ------------------------------------------------------------
// المشكلة الجذرية: كان كل طرف بيحدد "بداية اليوم" بتوقيته المحلي
// (السيرفر = UTC على السحابة، الأجهزة = توقيتها المحلي) →
// الترقيم اليومي للفواتير ما كانش بيبدأ من 1 في نفس اللحظة للجميع.
//
// الحل: مفتاح يوم موحّد (dayKey) بصيغة "YYYY-MM-DD" محسوب دائماً
// بتوقيت القاهرة مهما كان timezone السيرفر أو الجهاز.
// ============================================================

export const CAIRO_TIMEZONE = "Africa/Cairo";

/** دقائق إزاحة توقيت القاهرة عن UTC عند لحظة معينة (يدعم التوقيت الصيفي) */
const cairoOffsetMinutes = (date) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - date.getTime()) / 60000);
};

/**
 * مفتاح اليوم التجاري "YYYY-MM-DD" بتوقيت القاهرة.
 * مثال: 2026-09-21 — نفس القيمة للسيرفر والويب والديسكتوب.
 */
export const getBusinessDayKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  try {
    // en-CA ينتج الصيغة ISO "YYYY-MM-DD" مباشرة
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: CAIRO_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    // fallback نادر: لو Intl بلا دعم مناطق زمنية
    return d.toISOString().slice(0, 10);
  }
};

/**
 * بداية ونهاية اليوم التجاري بتوقيت القاهرة ككائنات Date (UTC داخلياً)
 * تُستخدم للاستعلام عن فواتير يوم معيّن بدقة.
 */
export const getBusinessDayRange = (dayKey) => {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  const noonUtcGuess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  const offsetMin = cairoOffsetMinutes(noonUtcGuess);
  const start = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0) - offsetMin * 60000);
  const end = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0) - offsetMin * 60000 + 86400000 - 1);
  return { start, end };
};
