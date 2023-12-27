export class DocumentAnalysisError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'DocumentAnalysisError';
    Object.setPrototypeOf(this, DocumentAnalysisError.prototype);
  }
}
