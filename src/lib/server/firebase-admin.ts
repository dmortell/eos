import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { FIREBASE_SERVICE_ACCOUNT } from '$env/static/private'

function getAdminApp() {
	if (getApps().length) return getApps()[0]
	const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT) as ServiceAccount
	return initializeApp({ credential: cert(serviceAccount) })
}

export function getAdminFirestore() {
	getAdminApp()
	return getFirestore()
}
