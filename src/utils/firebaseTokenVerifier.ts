import axios from 'axios';
import jwt from 'jsonwebtoken';

/**
 * Verifies a Firebase Auth ID token (what the frontends send as `googleToken`
 * after `signInWithPopup` + `user.getIdToken()`).
 *
 * Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 * without pulling in firebase-admin: RS256 signature against Google's public
 * certs, audience = project id, issuer = securetoken.google.com/<project id>.
 */

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getCerts(): Promise<Record<string, string>> {
    if (certCache && Date.now() < certCache.expiresAt) return certCache.certs;
    const res = await axios.get(CERTS_URL, { timeout: 5000 });
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers['cache-control'] || '')?.[1] || 3600);
    certCache = { certs: res.data, expiresAt: Date.now() + maxAge * 1000 };
    return res.data;
}

export interface VerifiedFirebaseUser {
    uid: string;
    email: string;
    emailVerified: boolean;
    name?: string;
    picture?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not configured');
    if (typeof idToken !== 'string' || !idToken) throw new Error('Missing token');

    const decodedHeader = jwt.decode(idToken, { complete: true });
    const kid = decodedHeader?.header?.kid;
    if (!kid) throw new Error('Malformed token');

    const certs = await getCerts();
    const cert = certs[kid];
    if (!cert) throw new Error('Unknown signing key');

    const payload = jwt.verify(idToken, cert, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
    }) as jwt.JwtPayload;

    if (!payload.sub || !payload.email) throw new Error('Token has no subject/email');

    return {
        uid: payload.sub,
        email: String(payload.email).toLowerCase().trim(),
        emailVerified: payload.email_verified === true,
        name: payload.name,
        picture: payload.picture,
    };
}
