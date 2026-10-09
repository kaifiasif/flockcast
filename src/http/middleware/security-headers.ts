import { secureHeaders } from 'hono/secure-headers';

/**
 * Browser-side defences for the API and the web app. The CSP forbids inline and third-party
 * scripts, so an XSS bug cannot load code that acts as the signed-in user.
 * Inline styles stay allowed: Radix positions popovers with them.
 */
export const securityHeaders = () =>
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xFrameOptions: 'DENY',
    // the app needs no device access
    permissionsPolicy: { microphone: [], camera: [], geolocation: [] },
    crossOriginEmbedderPolicy: false,
  });
