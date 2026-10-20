// Public pages run no JavaScript: the CSP forbids it and nothing on them needs it. Set here, above
// [token], so the error page of an unknown or revoked token renders without scripts too.
export const csr = false;
