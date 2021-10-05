const functions = require("firebase-functions");
const admin = require('firebase-admin');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
// Deploy with: firebase deploy --only functions:addMessage
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// exports.addMessage = functions.https.onRequest(async (req, res) => {
// 	const original = req.query.text;  // Grab the text parameter.
//   const writeResult = await admin.firestore().collection('messages').add({original: original});  // Push the new message into Firestore using the Firebase Admin SDK.
//   res.json({result: `Message with ID: ${writeResult.id} added.`});  // Send back a message that we've successfully written the message
// });



async function grantRole(email, role) {
	const user = await admin.auth().getUserByEmail(email);
	if (user.customClaims && user.customClaims.role === role) return;
	return admin.auth().setCustomUserClaims(user.uid, {role:role});
}
	// return admin.auth().getUserByEmail(email).then( (data,ctx) => {
	// 	return admin.auth().setCustomUserClaims(user.uid, {admin:true});
	// }).then(() => {
	// 	return {message:'Success'}
	// }).catch(err => {
	// 	return err;
	// })

exports.setRole = functions.region('asia-northeast1').https.onCall((data, context) => {
	const {email, role} = data;
	if (context.auth.token.role=='admin' || email=='david.mortell@eiresystems.com') {
		return grantRole(email, role).then(() => {
				return {result: `Role ${role} assigned to ${email}.`};
		});
	}
	return { error: "Request not authorized. User must be a moderator to fulfill request." };
});


// exports.AddUserRole = functions.auth.user().onCreate(async (authUser) => {
//   if (authUser.email) {
    // const customClaims = { admin: true, };
//     try {
//       var _ = await admin.auth().setCustomUserClaims(authUser.uid, customClaims)
      // return db.collection("roles").doc(authUser.uid).set({ email: authUser.email, role: customClaims })
//     } catch (error) {
//       console.log(error)
//     }
//   }
// });