import { getApp, getApps, initializeApp } from "firebase/app";
import { nanoid } from "nanoid";
import {
    getFirestore, collection, doc, getDoc, getDocs, deleteDoc, query, where,
    serverTimestamp, onSnapshot, setDoc, writeBatch,
    type Query, type DocumentData, type Firestore as FirestoreType, type QuerySnapshot
} from 'firebase/firestore';
import {
    getAuth, onAuthStateChanged, GoogleAuthProvider, GithubAuthProvider, OAuthProvider, signInWithPopup, signOut,
    type User, type UserCredential
} from "firebase/auth";

const config = {
    apiKey: 'AIzaSyCfoM8CLFAWuMDveWMeCJ8k3cYb-4ah_xA',
    authDomain: 'sunny-jetty-180208.firebaseapp.com',
    projectId: 'sunny-jetty-180208',
    storageBucket: 'sunny-jetty-180208.appspot.com',
    messagingSenderId: '699730861576',
    appId: '1:699730861576:web:73bfa0ed599a7011',
    databaseURL: 'https://sunny-jetty-180208.firebaseio.com',
};

export const firebase = getApps().length ? getApp() : initializeApp(config);
export const firestore = getFirestore(firebase);
export const auth = getAuth(firebase);

export class Session {
    user = $state<User | null>(null);
    unsub: () => void = () => {};

    private syncUserProfile(user: User): void {
        const payload = sanitizeFirestoreData({
            uid: user.uid,
            displayName: user.displayName ?? null,
            email: user.email ?? null,
            photoURL: user.photoURL ?? null,
            phoneNumber: user.phoneNumber ?? null,
            providerIds: user.providerData.map((p) => p.providerId),
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
        });
        setDoc(doc(firestore, 'users', user.uid), payload, { merge: true }).catch((error) => {
            console.error('Error syncing user profile:', error);
        });
    }

    constructor() {
        this.unsub?.()
        this.unsub = onAuthStateChanged(auth, (user) => {
            this.user = user
            if (user) this.syncUserProfile(user)
        })
    }
    async logout(): Promise<void> { await signOut(auth) }
    async login(provider: 'google' | 'github' | 'microsoft' = 'google'): Promise<UserCredential | undefined> {
        try {
            if (provider === 'google') return await signInWithPopup(auth, new GoogleAuthProvider());
            else if (provider === 'github') return await signInWithPopup(auth, new GithubAuthProvider());
            else if (provider === 'microsoft') return await signInWithPopup(auth, new OAuthProvider('microsoft.com'));
            else throw new Error(`Unknown provider ${provider}`)
        } catch (error) {
            console.error('Error signing in:', error);
        }
    }
}

export interface DocWithId {
    id: string
    [key: string]: unknown
}

function sanitizeFirestoreData<T>(input: T): T {
    if (Array.isArray(input)) {
        return input
            .map((item) => sanitizeFirestoreData(item))
            .filter((item) => item !== undefined) as T;
    }
    if (input && Object.prototype.toString.call(input) === '[object Object]') {
        const entries = Object.entries(input as Record<string, unknown>)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, sanitizeFirestoreData(value)]);
        return Object.fromEntries(entries) as T;
    }
    return input;
}

export class Firestore {
    async getMany(path: string): Promise<DocWithId[]> {
        const q = query(collection(firestore, path));
        const snap = await getDocs(q)
        return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
    }
    subscribeWhere(path: string, field: string, value: unknown, callback: (data: DocWithId[]) => void): () => void {
        const q = query(collection(firestore, path), where(field, '==', value));
        return onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            callback?.(data)
        });
    }
    subscribeMany(path: string, callback: (data: DocWithId[]) => void): () => void {
        const q = query(collection(firestore, path));
        return onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            callback?.(data)
        });
    }
    async getOne(path: string, id: string): Promise<DocWithId | null> {
        const snap = await getDoc(doc(firestore, path, id));
        return snap.exists() ? { ...snap.data(), id: snap.id } as DocWithId : null;
    }
    subscribeOne(table: string, id: string, callback: (data: DocWithId) => void): () => void {
        return onSnapshot(doc(firestore, table, id), snap => { callback?.({ ...snap.data(), id }) });
    }
    create = async (path: string, data: DocumentData): Promise<void> => {
        const clean = sanitizeFirestoreData(data);
        await setDoc(doc(collection(firestore, path)), clean, { merge: true });
    }
    save = async (path: string, data: DocWithId | DocumentData): Promise<void> => {
        const clean = sanitizeFirestoreData(data);
        if (!('id' in clean) || !clean.id) return await this.create(path, clean)
        await setDoc(doc(firestore, path, clean.id as string), clean, { merge: true });
    }
    async saveBatch(path: string, docs: DocWithId[], callback?: (docs: DocWithId[]) => void): Promise<void> {
        const batch = writeBatch(firestore);
        for (const d of docs) {
            const id = d.id || nanoid(8);
            d.id = id
            const ref = doc(firestore, path, id);
            const clean = sanitizeFirestoreData({ ...d, id, updatedAt: serverTimestamp() });
            batch.set(ref, clean, { merge: true });
        }
        await batch.commit();
        callback?.(docs)
    }
    async delete(path: string, id: string): Promise<void> {
        await deleteDoc(doc(firestore, path, id));
    }
    async deleteMany(path: string, docs: DocWithId[]): Promise<void> {
        const batch = writeBatch(firestore);
        for (const d of docs) {
            if (!d.id) continue;
            const shapeRef = doc(firestore, path, d.id);
            batch.delete(shapeRef);
        }
        await batch.commit();
    }
}
