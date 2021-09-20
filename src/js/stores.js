import { writable, readable, derived } from 'svelte/store';
// import { createStore } from 'framework7/lite';
// import firebase from 'firebase'			// todo try Supabase instead of firebase https://supabase.io/database
// import { initializeApp } from 'firebase/app';

// v9 compat packages are API compatible with v8 code
import firebase from 'firebase/compat/app';				// todo upgrade from firebase-compat v8 to v9
import 'firebase/compat/auth';							// see https://firebase.google.com/docs/web/modular-upgrade
import 'firebase/compat/firestore';

	// import { createEventDispatcher } from 'svelte';
	// export const dispatch = createEventDispatcher();

export const loading = writable({login:false})
// export const users = writable([])
export const alert = writable('')
// export const store = createStore({	// Framework7 store
// 	state: {},
// 	getters: {},					// use getters for reactivity (see stores-f7.js)
// 	actions: {},
// })

// export const writable = (initial_value = 0) => {
// 	let value = initial_value         // content of the store
// 	let subs = []                     // subscriber's handlers
// 	const subscribe = (handler) => {
// 	  subs = [...subs, handler]                                 // add handler to the array of subscribers
// 	  handler(value)                                            // call handler with current value
// 	  return () => subs = subs.filter(sub => sub !== handler)   // return unsubscribe function
// 	}
// 	const set = (new_value) => {
// 	  if (value === new_value) return         // same value, exit
// 	  value = new_value                       // update value
// 	  subs.forEach(sub => sub(value))         // update subscribers
// 	}
// 	const update = (update_fn) => set(update_fn(value))   // update function
// 	return { subscribe, set, update }       // store contract
// }

// export const localStore = (key, initial) => {                 // receives the key of the local storage and an initial value
// 	const toString = (value) => JSON.stringify(value, null, 2)  // helper function
// 	const toObj = JSON.parse                                    // helper function
// 	if (localStorage.getItem(key) === null) {                   // item not present in local storage
// 	  localStorage.setItem(key, toString(initial))              // initialize local storage with initial value
// 	}
// 	const saved = toObj(localStorage.getItem(key))              // convert to object
// 	const { subscribe, set, update } = writable(saved)          // create the underlying writable store
// 	return {
// 	  subscribe,
// 	  update,
// 	  set: (value) => {
// 		localStorage.setItem(key, toString(value))              // save also to local storage as a string
// 		return set(value)
// 	  },
// 	}
// }
// const initialTodos = [ { id: 1, name: 'Visit MDN web docs', completed: true }, ]
// export const todos = localStore('mdn-svelte-todo', initialTodos)


// see https://stackoverflow.com/questions/30833844/get-holidays-list-of-a-country-from-google-calendar-api
// Create an API app in google developer account .https://console.developers.google.com
// From the "Credentials" tab you can create an API key, you get something like this "AIzaSyBcOT_DpEQysiwFmmmZXupKpnrOdJYAhhM"
// Then you can access holiday calender using this url
// https://www.googleapis.com/calendar/v3/calendars/en.uk%23holiday%40group.v.calendar.google.com/events?key=yourAPIKey
// https://english.api.rakuten.net/collection/best-apis

// export const public_holidays = getHolidays();

// export async function getHolidays(){
// 	const key = "e6fcfcf21a054f33a40faa4e033dec64"	// under the free plan you can only query the current year
// 	const loc = "JP"								// https://app.abstractapi.com/api/holidays/tester
// 	const year = 2020
// 	// const url = "https://holidays.abstractapi.com/v1/?api_key={key}faa4e033dec64&country={loc}&year=2020&month=12&day=25"`
// 	const url = `https://holidays.abstractapi.com/v1/?api_key={key}faa4e033dec64&country={loc}&year={year}`
// 	fetch(url, {method: 'GET'})
// 	.then(response => response.json())
// 	.then(data=>{
// 		console.log(data)
// 		const holidays = data.map(d => { return { name: d.name, date: d.date_year+'-'+d.date_month+'-'+d.date_day} })
// 	})
// }
// [
//     {
//         "name": "January 2 Bank Holiday",
//         "name_local": "",
//         "language": "",
//         "description": "",
//         "country": "JP",
//         "location": "Japan",
//         "type": "Local holiday",
//         "date": "01/02/2020",
//         "date_year": "2020",
//         "date_month": "01",
//         "date_day": "02",
//         "week_day": "Thursday"
//     },
// ]

var firebaseConfig = {
	apiKey: 		"AIzaSyCfoM8CLFAWuMDveWMeCJ8k3cYb-4ah_xA",
	authDomain: 	"sunny-jetty-180208.firebaseapp.com",
	projectId: 		"sunny-jetty-180208",
	databaseURL:	"https://sunny-jetty-180208.firebaseio.com",
	storageBucket: 	"sunny-jetty-180208.appspot.com",
	appId: 			"1:699730861576:web:73bfa0ed599a7011",
	messagingSenderId: "699730861576",
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
// const firebase = {}
// const app = initializeApp(firebaseConfig);
// if (!firebase){
// 	const app = initializeApp(firebaseConfig);
// 	firebase.firestore = getFirestore(app);
// 	// const db = getFirestore(app);
// }

async function clearCookiesOnServer(csrf){
	await fetch('/auth/clear_cookies', { method: 'POST', body: JSON.stringify({csrf}), headers: {'Accept':'application/json', 'Content-Type':'application/json'}, })
}
async function sendTokenToServer(idToken, csrf){
	await fetch('/auth/session', {method:'POST', body:JSON.stringify({idToken, csrf}), headers:{'Accept':'application/json', 'Content-Type':'application/json' } })
}

function createSession() {
	let updateServer = false 	// POST user token to server?
	const { subscribe, set, update } = writable({user:null, loaded:false, loading:false,  token:''});

	// see https://firebase.google.com/docs/auth/web/manage-users
	firebase.auth().onAuthStateChanged(users => {				// onAuthStateChanged(callbackSuccess, callbackError);
		const user = users ? users.providerData[0] : null;
		const csrf = "csrf-FIX-LATER!"
		if (users) users.getIdToken().then(token=>{				// available user properties https://firebase.google.com/docs/reference/js/firebase.User
			set({loaded:true, loading:false, user, token});		// const {displayName, email, emailVerified, phoneNumber, photoURL} = user
			if (updateServer) sendTokenToServer(token, csrf)	// inform backend that user logged in
			saveUser(user);
		})
		else {
			set({loaded:true, loading:false, user, token:''});
			if (updateServer) clearCookiesOnServer(csrf);		// if (user.providerData[0].providerId=='microsoft.com'){}
		}
	});

	const error = (err,callback) => {
		console.log('Signin error', err)
		callback?.(null, err);				// if (callback) callback(null, err)		// optional chaining
	}

	const signout =	e => {firebase.auth().signOut()}
	const signin = (callback, provider='microsoft.com', options={}) => {
		update(val => { val.loading=true; return val; })
		firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(() => {
			let oauth = new firebase.auth.OAuthProvider(provider);
			oauth.setCustomParameters(options);		// oauth.addScope('profile');
			if (options.redirect){
				firebase.auth().signInWithRedirect(oauth).then(result => callback(result, null))
				.catch(err => error(err, callback));	// get email/creds from err: https://firebase.google.com/docs/reference/js/v8/firebase.auth.Auth#getredirectresult
			}
			else {
				firebase.auth().signInWithPopup(oauth).then(result => callback(result, null))
				.catch(err => error(err, callback));
			}
		})
		.catch(err => error(err, callback));
	}
	function loginResult(result){ console.info('User signin result', result) }
	const microsoftSignin = (redirect) => {			// redirect: bool to redirect or popup the provider login page
		signin(loginResult, 'microsoft.com', {tenant: '563253df-6fa2-48c2-b88d-bbe531475a4b', redirect})
	}

	return { subscribe, signin, signout, microsoftSignin, };
}
export const session = createSession();

export const tables = {
	quotes:		{name:"quotes", key:'pos'},
	details:	{name:"details"},		// quote details that can be added to your quote
	notes:		{name:"notes"},			// notes that can be added to your quote
	sheets:		{name:"timesheets"},
	times:		{name:"times"},
	users:		{name:"users"},
}

async function saveUser(user){			// called on session user change. Add new users to database
	function collection(){	return firebase.firestore().collection(tables.users.name) }
	const ref = collection().doc(user.email);	// console.log({ref})
	const res = await ref.set({
		displayName: user.displayName,
		email: user.email,
		providerId: user.providerId,
		uid: user.uid,
		start:'09:00',
		finish:'18:00',
		breaks:1,
		contract:'employee',
		role:'user',
	}, {merge: true});
	// Avatar url works only if logged in to outlook.office.com:
	// https://outlook.office.com/owa/service.svc/s/GetPersonaPhoto?email=david.mortell@eiresystems.com&UA=0&size=HR64x64&sc=1468233338850
}


var unsubs = []
export function cleanup(){ unsubs.map(unsub => unsub()) }

function connectTable(table){
	const { subscribe, set } = writable(null);
	function collection(){	return firebase.firestore().collection(table.name) }
	function snapshot(){
		const unsub = collection().onSnapshot(data => set(value => data));
		return unsub;
	}
	return {
		subscribe,			// Svelte subscribe(), required for reactivity
		collection,
		snapshot,			// usage: cons.times  = times.connect(times.collection().where("uid","==",uid).orderBy("date", "asc"), onTimesUpdate )
		connect: (collection, onSnap) => {
			var id = unsubs.length
			unsubs[id] = collection.onSnapshot(snap => { onSnap(snap) }, err => console.error(err));
			return id;
		},
		reconnect: (id, collection, onSnap) => {
			var unsub = unsubs[id];
			if (unsub) unsub();
			else id = unsubs.length		// var unsub3  = sheets.collection()	// .where("uid","==",uid).orderBy("date", "desc")
			unsubs[id] = collection.onSnapshot(snap => { onSnap(snap) }, err => console.error(err));
			return id
		},
		update: (data,id=null,callback=e=>console.log('updated',data,id)) => {
			if (id) collection().doc(id).update(data).then(callback)
			else collection().add(data).then(callback)		// 	if (batch)	batch.update(itemId, data)
		},
		// edit: (data,id=null,callback=e=>console.log('updated',data,id)) => {
		// 	if (id) collection().doc(id).update(data).then(callback)
		// 	else collection().add(data).then(callback)		// 	if (batch)	batch.update(itemId, data)
		// },
		delete: (id,callback = e=>console.log('deleted',id)) => {
			collection().doc(id).delete().then(callback)
		},
	};
}
export const times = connectTable(tables.times)
export const users = connectTable(tables.users)
export const sheets = connectTable(tables.sheets)

// export const _times = derived( times, $times => $times.filter(d => d.date.substr(0,7)===month) );
// $: days = filldays(_times)
// $: totals = calcTotals(days)
// $: uid = $session && $session.user ? $session.user.uid : null
// $: sid = {uid, displayName:$session.user.displayName}
// $: entry={ ...defaultEntry, uid: uid, }

// export const unused = readable(null, function start(set){
// 	const unsub = firebase.firestore().collection('times').onSnapshot(data => set(value => data));
// 	return function stop(){ unsub() };
// });





// function createMapStore(initial) {
// 	const store = writable(initial);
// 	const set = (key, value) => store.update(m => Object.assign({}, m, {[key]: value}));
// 	const results = derived(store, s => ({
// 		keys: Object.keys(s),
// 		values: Object.values(s),
// 		entries: Object.entries(s),
// 		set(k, v) {
// 			store.update(s => Object.assign({}, s, {[k]: v}))
// 		},
// 		remove(k) {
// 			store.update(s => {
// 				delete s[k];
// 				return s;
// 			});
// 		}
// 	}));
// 	return { subscribe: results.subscribe, set: store.set, }
// }
// const store = createMapStore({ a: 1, b: 2, c: 3, });
	// {#each $store.entries as [key, value]}
	// <div>{key}: {value}</div>
	// {/each}


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
export const holidays = readable(keyValues('date','name',[
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
]))
function keyValues(key_name, value_name, list){
	var result = {}
	list.map(item => result[item[key_name]] = item[value_name])
	return result;
}
