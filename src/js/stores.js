import { writable, readable, derived } from 'svelte/store';
import {parseEntry} from './formatter.js'
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirestore, collection, addDoc, setDoc, doc, query, where, onSnapshot } from "firebase/firestore";
import { getAuth, onAuthStateChanged, OAuthProvider, signInWithRedirect, signInWithPopup, signOut,
	sendEmailVerification, sendSignInLinkToEmail, getIdTokenResult,  } from "firebase/auth";

export const loading = writable({login:false})
export const alert = writable('')

export const tables = {
	quotes:		{name:"quotes", key:'pos'},
	details:	{name:"details"},		// quote details that can be added to your quote
	notes:		{name:"notes"},			// notes that can be added to your quote
	sheets:		{name:"timesheets"},
	times:		{name:"times"},
	leave:		{name:'leave'},
	users:		{name:"users"},
	settings:	{name:"settings"},		// todo edit company settings
}

// see https://stackoverflow.com/questions/30833844/get-holidays-list-of-a-country-from-google-calendar-api
// Create an API app in google developer account .https://console.developers.google.com
// From the "Credentials" tab you can create an API key, you get something like this "AIzaSyBcOT_DpEQysiwFmmmZXupKpnrOdJYAhhM"
// Then you can access holiday calender using this url
// https://www.googleapis.com/calendar/v3/calendars/en.uk%23holiday%40group.v.calendar.google.com/events?key=yourAPIKey
// export const public_holidays = getHolidays();

var o365Config = {tenant: '563253df-6fa2-48c2-b88d-bbe531475a4b'}		// enter your Microsoft tenant details here

const firebaseConfig = {
  apiKey: "AIzaSyDMXcAnx1UnFTp644sfHdeDlYf4o9T3Dlk",
  authDomain: "chaos-a6d03.firebaseapp.com",
  projectId: "chaos-a6d03",
  storageBucket: "chaos-a6d03.appspot.com",
  messagingSenderId: "513657878142",
  appId: "1:513657878142:web:caf69d51c2dc6424244a2f"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore();
const functions = getFunctions(firebaseApp, 'asia-northeast1');			// v9
// const functions = firebase.app().functions('asia-northeast1');		// v8

function createSession() {
	let updateServer = false 	// set to true to POST user token to server
	const { subscribe, set, update } = writable({user:null, loaded:false, loading:false,  token:''});
	const auth = getAuth();

	// see https://firebase.google.com/docs/auth/web/manage-users
	// or https://github.com/firebase/quickstart-js/blob/master/auth/google-credentials.html#L68-L69
	onAuthStateChanged(auth, user => {				// onAuthStateChanged(callbackSuccess, callbackError);
		// console.log('onAuthStateChanged',user)
		// const user = users ? users.providerData[0] : null;
		const provider = user?.providerData[0]
		const csrf = "csrf-FIX-LATER!"
		if (user){
			// user.getIdToken().then(token=>{				// available user properties https://firebase.google.com/docs/reference/js/firebase.User

			// 	// const emailVerified = users.emailVerified
			// 	var claims = user.customClaims ?? {};    // Add incremental custom claim without overwriting existing claims.
			// 	var role = 'none'

			// 	const newclaims = user.reloadUserInfo?.customAttributes
			// 	var tok = getIdTokenResult(user, true).then(t => console.log(tok=t))

			// 	// auth() .verifyIdToken(idToken) .then((decodedToken) => { const uid = decodedToken.uid; })		// https://firebase.google.com/docs/auth/admin/verify-id-tokens#web

			// 	console.log('auth.changed ', claims, newclaims, user)
			// 	set({loaded:true, loading:false, user, provider, claims});		// const {displayName, email, emailVerified, phoneNumber, photoURL} = user
			// 	// saveUser(user);																		// create a user record for application settings
			// })

			getIdTokenResult(user).then(token => {
				const claims = token.claims
				console.log('getTokenResult',claims)
				set({loaded:true, loading:false, user, provider, claims});		// const {displayName, email, emailVerified, phoneNumber, photoURL} = user
			})

			// user.getIdToken().then(token=>{				// available user properties https://firebase.google.com/docs/reference/js/firebase.User
			// // 	// auth() .verifyIdToken(idToken) .then((decodedToken) => { const uid = decodedToken.uid; })		// https://firebase.google.com/docs/auth/admin/verify-id-tokens#web
			// 	console.log('getIdToken',user,token)
			// })


			// user.getIdToken().then(token=>{				// available user properties https://firebase.google.com/docs/reference/js/firebase.User
			// 	var claims = user.customClaims ?? {};    // Add incremental custom claim without overwriting existing claims.
			// 	var role = 'none'
			// 	const newclaims = user.reloadUserInfo?.customAttributes
			// 	var tok = getIdTokenResult(user, true).then(t => console.log(tok=t))

			// 	// auth() .verifyIdToken(idToken) .then((decodedToken) => { const uid = decodedToken.uid; })		// https://firebase.google.com/docs/auth/admin/verify-id-tokens#web

			// 	console.log('auth.changed ', claims, newclaims, user)
			// 	set({loaded:true, loading:false, user, provider, claims});		// const {displayName, email, emailVerified, phoneNumber, photoURL} = user
			// 	// saveUser(user);																		// create a user record for application settings
			// })
		}
		else {
				set({loaded:true, loading:false, user, provider, claims:{}});
		}
	});

	// todo try onTokenChanged() [not available in auth]
	// onTokenChanged(auth, token =>{
	// 	console.log('ontokenchanged', token)
	// })


	// https://firebase.google.com/docs/auth/web/microsoft-oauth
	const signout =	e => { signOut(auth) }
	const signin = (callback, provider='microsoft.com', options=o365Config ) => {
		update(val => { val.loading=true; return val; })
		let oauth = new OAuthProvider(provider);
		oauth.setCustomParameters(options);		// oauth.addScope('profile');
		signInWithRedirect(auth, oauth)
		.then(result => callback(result, null))
		.catch(err => error(err, callback));	// get email/creds from err: https://firebase.google.com/docs/reference/js/v8/firebase.auth.Auth#getredirectresult
	}

	const microsoftSignin = (redirect) => {			// redirect: bool to redirect or popup the provider login page
		signin(loginResult, 'microsoft.com', {tenant: '563253df-6fa2-48c2-b88d-bbe531475a4b', redirect})
	}
	function loginResult(result){ console.info('User signin result', result) }
	function error(err,callback){
		console.log('Signin error', err)
		callback?.(null, err);				// if (callback) callback(null, err)		// optional chaining
	}

	async function setUserRole(user, role){			// called when an admin changes a users role. updates firebase claims and
		const customClaims = { role };
		try {
			const setRole = httpsCallable(functions, 'setRole');		// prepare to call Firebase function defined in /functions/index.js
			setRole({ email: user.email, role: role })
				.then((result) => {
					const data = result.data;
					// const sanitizedMessage = data.text;
					console.log('role change result', result)						// todo signal to the client of the updated user that the role has been modified and force it to refresh the token
					// update(current => { return {...current, role:result} })		// no good, this updates current session instead of the update user
				});
			// await setCustomUserClaims(user.uid, customClaims);
		} catch (error) { console.log(error); }		// error.code .message .details
	}

	async function refreshToken(user){		// await user.getIdToken(true)
		const token = await getIdTokenResult(user, true)
		console.log('update.token ',token)
		return token

		// getIdTokenResult(user, true).then(token => {
		// 	console.log('update.token',token)
		// 	return token
		// })
	}

	return { subscribe, signin, signout, microsoftSignin, setUserRole, refreshToken};
}
export const session = createSession();


export function sendVerificationLink(callback){
	const actionCodeSettings = {
		// URL you want to redirect back to. The domain must be in the authorized domains list in the Firebase Console.
		// url: 'https://www.example.com/finishSignUp?cartId=1234',
		url: 'http://localhost:3000',											// http://localhost:3000/
		// url: 'http://eire-eos.vercel.app/?email=' + email,											// http://localhost:3000/
		handleCodeInApp: true,								// This must be true.
		iOS: { bundleId: 'com.example.ios' },
		android: { packageName: 'com.example.android', installApp: true, minimumVersion: '12' },
		// dynamicLinkDomain: 'example.page.link'
		// dynamicLinkDomain: 'http://localhost'
		// dynamicLinkDomain: 'http://eire-eos.vercel.app'		// enable dynamic links, see https://firebase.google.com/docs/dynamic-links
		// dynamicLinkDomain: 'eire-eos.vercel.app'		// enable dynamic links, see https://firebase.google.com/docs/auth/web/passing-state-in-email-actions#passing_statecontinue_url_in_email_actions
		dynamicLinkDomain: 'sunny-jetty-180208.web.app'		// enable dynamic links, see https://firebase.google.com/docs/auth/web/passing-state-in-email-actions#passing_statecontinue_url_in_email_actions
	};

	const auth = getAuth();
	sendEmailVerification(auth.currentUser, actionCodeSettings)
		.then(()=>{
			console.log('verification.link sent')
			if (callback) callback(null)
		})
		.catch(error=>{
			console.error('verification.link error:', error);		// error.code, error.message
			if (callback) callback(error)
		})
		// when the user enters the code:
		// await applyActionCode(auth, code);
}
	// async function onCreate(user){										// Check if user meets role criteria.
	// 	if (user.email && user.email.endsWith('@admin.example.com') && user.emailVerified){
	// 		const customClaims = { role: 'admin' };
	// 		try {
	// 			await admin.auth().setCustomUserClaims(user.uid, customClaims);
	// 			const metadataRef = admin.database().ref('metadata/' + user.uid);		// Update real-time database to notify client to force refresh.
	// 			await  metadataRef.set({refreshTime: new Date().getTime()});				// Set the refresh time to the current UTC timestamp.
	// 		} catch (error) { console.log(error); }
	// 	}
	// }

	// admin.auth().getUserByEmail('user@admin.example.com').then((user) => {
	// 	const currentCustomClaims = user.customClaims;    // Add incremental custom claim without overwriting existing claims.
  //   if (currentCustomClaims['admin']) {
  //     currentCustomClaims['accessLevel'] = 10;
  //     return admin.auth().setCustomUserClaims(user.uid, currentCustomClaims);
  //   }
  // })
  // .catch((error) => { console.log(error); });




// For the web, offline persistence is disabled by default.
// https://firebase.google.com/docs/firestore/manage-data/enable-offline
// todo switch snapshot tables to https://github.com/Evertt/flipside/tree/master/src/store

var unsubs = []
export function cleanup(){ unsubs.map(unsub => unsub()) }

function connectTable(table){
	const { subscribe, set, update } = writable(null);
	function snapshot(){
		const unsub = onSnapshot(collection(db, table.name), data => set(value => data));
		return unsub;
	}
	return {
		subscribe,			// Svelte subscribe(), required for reactivity
		snapshot,			// usage: cons.times  = times.connect(times.collection().where("uid","==",uid).orderBy("date", "asc"), onTimesUpdate )
		disconnect: (id) =>{
			var unsub = unsubs[id];
			if (unsub) unsub();
			return unsubs[id] = null;
		},
		reconnect: (onUpdate, uid=null) => {
			const id = table.name, unsub = unsubs[id];
			if (unsub) unsub();
			const ref = collection(db, table.name)
			const q = uid ? query(ref, where("uid", "==", uid)) : ref
			unsubs[id] = onSnapshot(q, snap => { onUpdate(snap) }, err => console.error(err));
			return id
		},
		update: async (data,id=null,callback=(data,id)=>console.log('connectTable.updated',data,id)) => {
			if (id) {
				await setDoc(doc(db, table.name, id), data, {merge:true})
				// await updateDoc(doc(db, table.name, id), { "age": 13, "favorites.color": "Red" });
			}
			else {
				console.log('table.update.adding')
				const ref = await addDoc(collection(db, table.name), data, {merge:true})
				data.id = id = ref.id
			}
			if (callback) callback(data,id)
			return data
		},
		delete: (id,callback = e=>console.log('connectTable.deleted',id)) => {
			doc(db, table.name, id).delete().then(callback)
		},
	};
}
export const times = connectTable(tables.times)
export const users = connectTable(tables.users)
export const leave = connectTable(tables.leave)
export const sheets = connectTable(tables.sheets)


async function saveUser(userdata){			// called on session user change. Add new users to database
	var keys = ['displayName', 'email', 'uid'], changed = 0
	const data = {}
	keys.map(key=> {
		if (userdata[key] != user[key]){
			data[key] = userdata[key];
			changed++;
		}
	})
	const data2 = {
		displayName: userdata.displayName,
		email: userdata.email,
		uid: userdata.uid,
		// providerId: userdata.providerId,
		// start:'09:00',
		// finish:'18:00',
		// breaks:1,
		// contract:'employee',
		// role:'userdata',
	}
	if (changed) await users.update(data, userdata.email)
}


export const settings = readable({		// todo make this editable
	company:'EIRE Systems',
	address:'Hokkai Shiga Bldg, 2-31-15 Shiba, Minato-ku, Tokyo 105-0014',
	tel:'+81-3-5484-7935',
	fax:'+81-3-5484-7934',
})
export const clients = readable([			// todo make clients realtime firebase
	{type:'eire',	 		name:'EIRE Systems'},
	{type:'client1',		name:'Client 1'},
])
export const work_types = readable([
	{type:'normal', 		name:'Normal Day'},
	{type:'weekend',		name:'Weekend'},
	{type:'public',			name:'National Holiday'},
	{type:'compensation',	name:'Compensation Day'},
	{type:'paid_full',		name:'Paid Leave (full day)'},
	{type:'paid_half',		name:'Paid Leave (half day)'},
	{type:'unpaid_leave',	name:'Unpaid leave'},
	{type:'client_holiday',	name:'Client holiday'},
	{type:'sick',			name:'Sick'},
	{type:'other_leave',	name:'Other leave'},
])
export const contracts = readable([
	{type:'normal', 		name:'Normal Contract'},
	{type:'type A', 		name:'Contract type A'},
	{type:'type B', 		name:'Contract type B'},
	{type:'type C', 		name:'Contract type C'},
])
export const roles = readable([
	{type:'payroll', 	name:'Payroll'},
	{type:'user', 		name:'Staff'},
	{type:'admin', 		name:'Admin'},
	{type:'management',	name:'Management'},
])
export const leave_types = readable([
	{type:'paid_leave',		name:"Paid leave"},
	{type:'sick_leave',		name:"Sick leave"},
	{type:'special_leave',	name:"Special leave"},
	{type:'unpaid_leave',	name:"Unpaid leave"},
])
export const holidays = readable(keyValues([
	{date:"2019-01-01", name:"New Year's Day"},
	{date:"2019-01-02", name:"EIRE Office Closed"},
	{date:"2019-01-03", name:"EIRE Office Closed"},
	{date:"2019-01-14", name:"Coming of Age Day"},
	{date:"2019-02-11", name:"Foundation Day"},
	{date:"2019-03-21", name:"Vernal Equinox Day"},
	{date:"2019-04-29", name:"Shōwa Day"},
	{date:"2019-04-30", name:"Bridge Public Holiday"},
	{date:"2019-05-01", name:"Emperor's coronation"},
	{date:"2019-05-02", name:"Bridge Public Holiday"},
	{date:"2019-05-03", name:"Constitution Memorial Day"},
	{date:"2019-05-04", name:"Greenery Day"},
	{date:"2019-05-05", name:"Children's Day"},
	{date:"2019-05-06", name:"Children's Day observed"},
	{date:"2019-07-15", name:"Marine Day"},
	{date:"2019-08-11", name:"Mountain Day"},
	{date:"2019-08-12", name:"Mountain Day observed"},
	{date:"2019-09-16", name:"Respect-for-the-Aged Day"},
	{date:"2019-09-23", name:"Autumnal Equinox Day"},
	{date:"2019-10-14", name:"Health and Sports Day"},
	{date:"2019-10-22", name:"Emperor's coronation ceremony"},
	{date:"2019-11-03", name:"Culture Day"},
	{date:"2019-11-04", name:"Culture Day observed"},
	{date:"2019-11-23", name:"Labour Thanksgiving Day"},
	{date:"2020-01-01", name:"New Year's Day"},
	{date:"2020-01-02", name:"EIRE Office Closed"},
	{date:"2020-01-03", name:"EIRE Office Closed"},
	{date:"2020-01-13", name:"Coming of Age Day"},
	{date:"2020-02-11", name:"Foundation Day"},
	{date:"2020-02-23", name:"The Emperor's Birthday"},
	{date:"2020-02-24", name:"The Emperor's Birthday observed"},
	{date:"2020-03-20", name:"Vernal Equinox Day"},
	{date:"2020-04-29", name:"Shōwa Day"},
	{date:"2020-05-03", name:"Constitution Memorial Day"},
	{date:"2020-05-04", name:"Greenery Day"},
	{date:"2020-05-05", name:"Children's Day"},
	{date:"2020-05-06", name:"Constitution Memorial Day observed"},
	{date:"2020-07-23", name:"Marine Day"},
	{date:"2020-07-24", name:"Sports Day"},
	{date:"2020-08-10", name:"Mountain Day"},
	{date:"2020-09-21", name:"Respect-for-the-Aged Day"},
	{date:"2020-09-22", name:"Autumnal Equinox Day"},
	{date:"2020-11-03", name:"Culture Day"},
	{date:"2020-11-23", name:"Labour Thanksgiving Day"},
	{date:"2021-01-01", name:"New Year's Day"},
	{date:"2021-01-11", name:"Coming of Age Day"},
	{date:"2021-02-11", name:"Foundation Day"},
	{date:"2021-02-23", name:"The Emperor's Birthday"},
	{date:"2021-03-20", name:"Vernal Equinox Day"},
	{date:"2021-04-29", name:"Shōwa Day"},
	{date:"2021-05-03", name:"Constitution Memorial Day"},
	{date:"2021-05-04", name:"Greenery Day"},
	{date:"2021-05-05", name:"Children's Day"},
	{date:"2021-07-22", name:"Marine Day"},
	{date:"2021-07-23", name:"Sports Day"},
	{date:"2021-08-08", name:"Mountain Day"},
	{date:"2021-08-09", name:"Mountain Day observed"},
	{date:"2021-09-20", name:"Respect-for-the-Aged Day"},
	{date:"2021-09-23", name:"Autumnal Equinox Day"},
	{date:"2021-11-03", name:"Culture Day"},
	{date:"2021-11-23", name:"Labour Thanksgiving Day"},
],'date','name'))
export function keyValues(list, key_name='type', value_name='name'){	// return an object with {key:value, ...}
	var result = {}
	list.map(item => result[item[key_name]] = item[value_name])
	return result;
}


export function monthTotal(times, month){
	const keys = ['a','b','c','d','hours','days','less']
	const totals = {a:0, b:0, c:0, d:0, hours:0, days:0, less:0, month}
	if (times) times.map(entry => {
		if (entry.date.startsWith(month)){
			var data = parseEntry(entry, holidays)
			keys.map(k => totals[k] += data[k] ?? 0) 		// calculate totals
		}
	})
	return totals
}
