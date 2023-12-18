import { initializeJWT } from './strategies/initializeJwtstrategy';
import { initializeSignup } from './strategies/initializeSignup';
import { initializeLogin } from './strategies/initializeLogin';
import { initializeGithubLogin } from './strategies/initializeGithubStrategy';
import { initializeGoogleLogin } from './strategies/initializeGoogleStrategy';

export const initializePassport = () => {
    initializeJWT();
    initializeSignup();
    initializeLogin();
    initializeGithubLogin();
    initializeGoogleLogin();
};
