/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import serverless from 'serverless-http';
import { buildApiExpressApp } from '../../server.ts';

const app = buildApiExpressApp();

export const handler = serverless(app, {
  request: (request: any, event: any) => {
    const rawPath = event.path || request.url || '';
    if (rawPath.startsWith('/.netlify/functions/api')) {
      const remaining = rawPath.replace('/.netlify/functions/api', '');
      request.url = (remaining.startsWith('/api') ? remaining : `/api${remaining || ''}`) +
        (event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : '');
    } else if (rawPath && !rawPath.startsWith('/api')) {
      request.url = `/api${rawPath}` +
        (event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : '');
    }
  },
});
