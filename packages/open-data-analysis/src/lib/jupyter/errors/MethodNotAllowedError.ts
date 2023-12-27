export class MethodNotAllowedError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'MethodNotAllowedError';
    Object.setPrototypeOf(this, MethodNotAllowedError.prototype);
  }
}
