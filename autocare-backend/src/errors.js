// An error with an HTTP status and a message that is safe to show to the user.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Which unique column caused a duplicate-entry error from the database, if any.
export function duplicateOf(err) {
  if (err?.code !== 'ER_DUP_ENTRY') return null;
  const text = String(err.sqlMessage || '').toLowerCase();
  if (text.includes('email')) return 'email';
  if (text.includes('username')) return 'username';
  if (text.includes('plate')) return 'plate';
  return 'other';
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body is not valid JSON.' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
}
