import { authorizationServer, jsonDocument } from '#lib/server/oauth-metadata.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => jsonDocument(authorizationServer(url.origin));
