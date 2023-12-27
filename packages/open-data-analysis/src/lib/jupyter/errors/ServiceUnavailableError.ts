export class ServiceUnavailableError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}
