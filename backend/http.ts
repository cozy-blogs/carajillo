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
}