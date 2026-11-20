export const logger = {
  info: (msg: string) => {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  },
  error: (msg: string, error?: any) => {
    console.error([msg, error]);
  },
  warn: (msg: string) => {
    console.warn([msg]);
  },
};
