import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import {
	createPasskeyCredential,
	getPasskeyCredentialByCredentialId,
	getPasskeyCredentialsForUser
} from '$lib/server/db';
import { isAuthEnabled, SESSION_COOKIE, validateSession } from '$lib/server/auth';
import {
	encodeWebAuthnBytes,
	getWebAuthnConfig,
	hasExactWebAuthnOrigin,
	webAuthnChallenges
} from '$lib/server/webauthn';

const NO_STORE = { 'Cache-Control': 'no-store' };

function isUniqueConstraintError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const candidate = error as { code?: string; message?: string };
	return candidate.code === '23505' || /unique constraint/i.test(candidate.message || '');
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!(await isAuthEnabled())) return json({ error: 'Authentication is not enabled' }, { status: 400, headers: NO_STORE });

	let config;
	try {
		config = getWebAuthnConfig();
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Passkeys are not configured' }, { status: 503, headers: NO_STORE });
	}
	if (!hasExactWebAuthnOrigin(request)) return json({ error: 'Invalid request origin' }, { status: 403, headers: NO_STORE });

	const user = await validateSession(cookies);
	const sessionId = cookies.get(SESSION_COOKIE);
	if (!user || !sessionId) return json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });

	let body: { ceremonyId?: string; response?: RegistrationResponseJSON; name?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE });
	}

	if (!body.ceremonyId || !body.response) return json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE });
	const ceremony = webAuthnChallenges.consume(body.ceremonyId, 'registration', { userId: user.id, sessionId });
	if (!ceremony?.userHandle) return json({ error: 'Passkey ceremony expired or is invalid' }, { status: 400, headers: NO_STORE });

	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (name.length > 64) return json({ error: 'Passkey name must be 64 characters or fewer' }, { status: 400, headers: NO_STORE });

	try {
		const verification = await verifyRegistrationResponse({
			response: body.response,
			expectedChallenge: ceremony.challenge,
			expectedOrigin: config.expectedOrigin,
			expectedRPID: config.rpId,
			requireUserVerification: true
		});
		if (!verification.verified || !verification.registrationInfo) {
			return json({ error: 'Passkey registration could not be verified' }, { status: 400, headers: NO_STORE });
		}

		const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
		if (await getPasskeyCredentialByCredentialId(credential.id)) {
			return json({ error: 'This Passkey is already registered' }, { status: 409, headers: NO_STORE });
		}

		const existingCredentials = await getPasskeyCredentialsForUser(user.id);
		if (existingCredentials.some((item) => item.webauthnUserId !== ceremony.userHandle)) {
			return json({ error: 'Passkey user handle mismatch' }, { status: 400, headers: NO_STORE });
		}

		const saved = await createPasskeyCredential({
			userId: user.id,
			credentialId: credential.id,
			webauthnUserId: ceremony.userHandle,
			publicKey: encodeWebAuthnBytes(credential.publicKey),
			counter: credential.counter,
			deviceType: credentialDeviceType,
			backedUp: credentialBackedUp,
			transports: credential.transports ? JSON.stringify(credential.transports) : null,
			name: name || null
		});

		return json({
			success: true,
			passkey: {
				id: saved.id,
				name: saved.name,
				deviceType: saved.deviceType,
				backedUp: saved.backedUp,
				createdAt: saved.createdAt
			}
		}, { headers: NO_STORE });
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			return json({ error: 'This Passkey is already registered' }, { status: 409, headers: NO_STORE });
		}
		return json({ error: 'Passkey registration could not be verified' }, { status: 400, headers: NO_STORE });
	}
};
