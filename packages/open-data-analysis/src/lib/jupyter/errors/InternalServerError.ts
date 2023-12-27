export class InternalServerError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'InternalServerError';
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}
