import type { Request, Response, NextFunction } from "express";
import { logger } from "@/utils/logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(req: Request, res: Response) {
  res
    .status(404)
    .json({ error: `Not Found: ${req.method} ${req.originalUrl}` });
}

// 注意：错误中间件必须是 4 个参数，Express 靠 arity 识别
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = err instanceof HttpError ? err.status : 500;
  logger.info(
    `[error] ${req.method} ${req.originalUrl} -> ${status} ${err.message}`,
  );

  if (res.headersSent) return;
  res.status(status).json({
    error: status === 500 ? "Internal Server Error" : err.message,
  });
}
