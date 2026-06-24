// Tiny timestamped logger. No deps.
function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}
function fmt(level, args) {
  return [`[${ts()}] [${level}]`, ...args];
}
export const log = {
  info: (...a) => console.log(...fmt('INFO', a)),
  warn: (...a) => console.warn(...fmt('WARN', a)),
  error: (...a) => console.error(...fmt('ERROR', a)),
  debug: (...a) => {
    if (process.env.DEBUG) console.log(...fmt('DEBUG', a));
  },
};
export default log;
