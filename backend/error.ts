import { ErrorRequestHandler, Response } from "express";

export interface HttpErrorProperties {
  statusCode: number;
  message: string;

  /// String for API use e.x. do different 401 errors by users
  reason?: string;

  /// Extra debug message for the server logs.
  /// Can contain sensitive data; not for dispatching through REST interface.
  details?: string;
}

export class HttpError extends Error {
  statusCode: number;
  reason?: string;
  details?: string;

  constructor(props: HttpErrorProperties)
  {
    super(props.message);
    this.name = "HttpError";
    this.statusCode = props.statusCode;
    this.reason = props.reason;
    this.details = props.details;
  }

  respond(res: Response) {
    console.warn(`HTTP/1.1 ${this.statusCode} ${this.reason} ${this.message}; ${this.details}`);
    res.status(this.statusCode).json({
      success: false,
      error: this.message,
      reason: this.reason
    })
  }
}

export const middleware : ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof HttpError) {
    err.respond(res);
  } else {
    console.error('unhandled exception', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred'
    });
  }
}