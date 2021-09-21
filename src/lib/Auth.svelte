<script>
// from https://codechips.me/firebase-authentication-with-svelte/
/*
Usage:
<scr ipt>
  import firebase from 'firebase/app';
  import Auth from './Auth.svelte';
  const firebaseConfig = {
    apiKey: 'firebase-api-key',
    authDomain: 'testing-firebase-emulators.firebaseapp.com',
    projectId: 'testing-firebase-emulators'
  };
  firebase.initializeApp(firebaseConfig);

  let loginWithEmailPassword;
  let error = null;

  const loginHandler = async event => {
    const { email, password } = event.target.elements;
    try {
      error = null;
      await loginWithEmailPassword(email.value, password.value);
    } catch (err) {
      error = err;
    }
  };
</scr ipt>

<div class="wrapper">
  <Auth useRedirect={true} let:user let:loggedIn let:loginWithGoogle bind:loginWithEmailPassword let:logout >
    {#if loggedIn}
      <div class="w-full max-w-xs">
        <div class="text-center">
          <h2>{user.email}</h2>
          <button type="button" class="mt-3" on:click={logout}>Logout</button>
        </div>
      </div>
    {:else}
	  <Login>
		<form on:submit|preventDefault={loginHandler} class="px-8 pt-6 pb-8 bg-white shadow-md" >
			<button type="submit">Sign In</button>
        	<button type="button" on:click|preventDefault={loginWithGoogle}>Sign In with Google</button>
		</form>
      </Login>
    {/if}
  </Auth>
</div>
*/
	import firebase from 'firebase/app';
	import 'firebase/auth';
	export let useRedirect = false;		// expose property on the component to choose if we want use popup or redirect
	const auth = firebase.auth();
	let user = null;					// Firebase user
	$: loggedIn = user !== null;	// reactive helper variable

	const userMapper = claims => ({
	  id: claims.user_id,
	  name: claims.name,
	  email: claims.email,
	  picture: claims.picture
	});


// ---- use the following if moving auth code to a separate auth.js file
// and use it in App.svelte with: const { loginWithEmailPassword, loginWithGoogle, logout, user } = initAuth();

// import firebase from 'firebase/app';
// import 'firebase/auth';
// import { readable } from 'svelte/store';
// const userMapper = claims => ({ id: claims.user_id, name: claims.name, email: claims.email, picture: claims.picture });

// // construction function. need to call it after we initialize our firebase app
// export const initAuth = (useRedirect = false) => {
//   const auth = firebase.auth();

//   const loginWithEmailPassword = (email, password) =>
//     auth.signInWithEmailAndPassword(email, password);

//   const loginWithGoogle = () => {
//     const provider = new firebase.auth.GoogleAuthProvider();

//     if (useRedirect) {
//       return auth.signInWithRedirect(provider);
//     } else {
//       return auth.signInWithPopup(provider);
//     }
//   };

//   const logout = () => auth.signOut();

//   // wrap Firebase user in a Svelte readable store
//   const user = readable(null, set => {
//     const unsub = auth.onAuthStateChanged(async fireUser => {
//       if (fireUser) {
//         const token = await fireUser.getIdTokenResult();
//         const user = userMapper(token.claims);
//         set(user);
//       } else {
//         set(null);
//       }
//     });

//     return unsub;
//   });

//   return {
//     user,
//     loginWithGoogle,
//     loginWithEmailPassword,
//     logout
//   };
// };

	export const loginWithEmailPassword = (email, password) => auth.signInWithEmailAndPassword(email, password);

	export const loginWithGoogle = () => {
	  const provider = new firebase.auth.GoogleAuthProvider();
	  if (useRedirect) {
		return auth.signInWithRedirect(provider);
	  } else {
		return auth.signInWithPopup(provider);
	  }
	};

	export const logout = () => auth.signOut();

	auth.onAuthStateChanged(async fireUser => {		// will be fired every time auth state changes
	  if (fireUser) {
		// in here you might want to do some further actions such as loading more data, etc.
		// if you want to set custom claims such as roles on a user
		// this is how to get them because they will be present
		// on the token.claims object
		const token = await fireUser.getIdTokenResult();
		user = userMapper(token.claims);
	  } else {
		user = null;
	  }
	});
  </script>

  <!-- expose all required methods and properties on our slot -->
  <div>
	<slot {user} {loggedIn} {loginWithGoogle} {loginWithEmailPassword} {logout} />
  </div>