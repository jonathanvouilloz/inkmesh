import { jsonDocument, protectedResource } from '#lib/server/oauth-metadata.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => jsonDocument(protectedResource(url.origin));
