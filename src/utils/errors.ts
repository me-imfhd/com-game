export class AppError extends Error {
  constructor(
    public statusCode: number,
    public status: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "fail", message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, "fail", message);
  }
}
