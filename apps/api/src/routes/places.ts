import { Hono } from 'hono';
import { nearbyQuery } from '@skinny/shared';
import { validate } from '../validate.js';
import { authenticate, requireActive, type AuthEnv } from '../middleware/auth.js';
import { nearbyPlaces } from '../services/places.js';

export type PlaceDeps = { nearby: typeof nearbyPlaces };

export function placeRoutes(deps: Partial<PlaceDeps> = {}) {
  const nearby = deps.nearby ?? nearbyPlaces;
  const routes = new Hono<AuthEnv>();
  // Guards before the validator: an anonymous caller with a malformed query gets 401, not 400.
  routes.get('/nearby', authenticate, requireActive, validate('query', nearbyQuery), async (c) => {
    const { lat, lng } = c.req.valid('query');
    return c.json(await nearby(lat, lng));
  });
  return routes;
}
