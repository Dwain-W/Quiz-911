export function ymd(date = new Date()) {
  return date.toISOString().slice(0,10);
}

export function dayDiff(a, b) {
  const A = new Date(ymd(a)), B = new Date(ymd(b));
  return Math.round((A - B) / (1000*60*60*24));
}
