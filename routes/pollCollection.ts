import { Router } from 'express';
import passport from 'passport';
import * as pollCollectionController from '../controllers/pollCollectionController';

export const pollCollectionRoute = Router();

pollCollectionRoute.get(
    '/poll/collection',
    passport.authenticate('jwt', { session: false }),
    pollCollectionController.getPaginatedPollCollection
);

pollCollectionRoute.get(
    '/poll/:id/single',
    passport.authenticate('jwt', { session: false }),
    pollCollectionController.getSinglePoll
);
