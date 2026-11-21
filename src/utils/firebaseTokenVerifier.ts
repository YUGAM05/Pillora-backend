import axios from 'axios';
import jwt from 'jsonwebtoken';

/**
 * Verifies a Firebase Auth ID token (what the patient site sends as
 * `googleToken` after `signInWithPopup` + `user.getIdToken()`).
 *
 * Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 * without firebase-admin: RS256 signature against Google's published
 * securetoken certificates, audience = project id,
 * issuer = https://securetoken.google.com/<project id>, plus exp/iat/sub checks.
 */

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// The Firebase project id is public (it is in the patient site's bundle);
// FIREBASE_PROJECT_ID overrides it if the project ever changes.
const DEFAULT_PROJECT_ID = 'pillora-ad783';

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getCerts(forceRefresh = false): Promise<Record<string, string>> {
    if (!forceRefresh && certCache && Date.now() < certCache.expiresAt) return certCache.certs;
    const res = await axios.get(CERTS_URL, { timeout: 5000 });
    const maxAge = Number(/max-age=(\d+)/.exec(String(res.headers['cache-control'] || ''))?.[1] || 3600);
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

export async function verifyFirebaseIdToken(idToken: unknown): Promise<VerifiedFirebaseUser> {
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim() || DEFAULT_PROJECT_ID;
    if (typeof idToken !== 'string' || !idToken) throw new Error('Missing token');

    const decodedHeader = jwt.decode(idToken, { complete: true });
    const kid = decodedHeader?.header?.kid;
    if (!kid || decodedHeader?.header?.alg !== 'RS256') throw new Error('Malformed token');

    let certs = await getCerts();
    if (!certs[kid]) certs = await getCerts(true); // keys rotate; refetch once
    const cert = certs[kid];
    if (!cert) throw new Error('Unknown signing key');

    const payload = jwt.verify(idToken, cert, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
    }) as jwt.JwtPayload;

    if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Token has no subject');
    if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now() + 60_000) {
        throw new Error('Token auth_time is in the future');
    }
    if (!payload.email) throw new Error('Token has no email');

    return {
        uid: payload.sub,
        email: String(payload.email).toLowerCase().trim(),
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
}
