/** Error codes the catalogue names (cloud.error.*); anything else reads as INTERNAL. */
export const KNOWN_ERRORS: ReadonlySet<string> = new Set([
  'OFFLINE', 'INTERNAL', 'OWNER_KEY_REQUIRED', 'DATABASE_NOT_CONFIGURED', 'INVALID_CHART',
  'CHART_LIMIT_REACHED', 'NOT_FOUND', 'BODY_TOO_LARGE', 'INVALID_JSON', 'INVALID_ID',
]);
