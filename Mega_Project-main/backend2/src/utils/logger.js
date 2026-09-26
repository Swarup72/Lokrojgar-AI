/**
 * Custom Logger Utility
 * Provides structured logging with ISO timestamps and log levels.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLogLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

const formatMessage = (level, message, meta = null) => {
  const timestamp = new Date().toISOString();
  let formattedMeta = "";

  if (meta) {
    if (meta instanceof Error) {
      formattedMeta = ` | ${meta.stack || meta.message}`;
    } else if (typeof meta === "object") {
      try {
        formattedMeta = ` | ${JSON.stringify(meta)}`;
      } catch (err) {
        formattedMeta = ` | [Circular Object]`;
      }
    } else {
      formattedMeta = ` | ${meta}`;
    }
  }

  return `[${timestamp}] [${level}] ${message}${formattedMeta}`;
};

const logger = {
  debug: (message, meta) => {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatMessage("DEBUG", message, meta));
    }
  },

  info: (message, meta) => {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage("INFO", message, meta));
    }
  },

  warn: (message, meta) => {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(formatMessage("WARN", message, meta));
    }
  },

  error: (message, meta) => {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      console.error(formatMessage("ERROR", message, meta));
    }
  },
};

export default logger;
export { logger };
