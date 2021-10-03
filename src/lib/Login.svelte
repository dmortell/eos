<script>
	import {onMount} from 'svelte'
	import {Row, Col, Button} from 'svelte-chota'
	import {session, alert} from '$js/stores'
	import Alert from '$lib/Alert.svelte'

	onMount(() => {
		document.getElementById("app-loading")?.remove();
	})

const login = () => {
		$alert = "logging in"
		session.signin((result, err)=>{
			if (err){
				console.log(err)
				console.log(err.qa)
				$alert = "Signin error"
			}
		})		// callback, provider='microsoft.com', options={}
		// session.microsoftSignin(true)
	}
	//https://preview.colorlib.com/theme/bootstrap/login-form-05/
</script>

<div class="container-login100">
		<div class="wrap-login100">
			<div class="login100-form-title" style="background-image: url(./bg-01.jpg);">
				<span class="login100-form-title-1">Sign In</span>
			</div>

			<img class="login100-logo" src="/logo.gif" alt="Eire Logo"/>
			<div class="login100-form">
				<p>Single Sign On with your Office 365 work account.</p>
				<p>
					<img src="./authenticator.webp" class='lock' width=32 height=32 alt="Microsoft Authenticator"  />
					Microsoft Authenticator is required on your smartphone if two-factor authentication is enabled.</p>
				<a on:click={login} disabled={$session.loading} href="#login" id="mso365-login"><span class="o365icon"/> <span class="buttonText">Sign in with Office 365</span></a>
			</div>
		</div>
	</div>
	<Alert />


<style>
	p {padding: 16px 0; }
	.container-login100 { min-height: 100vh; display: flex; flex-wrap: wrap; justify-content: center; background: #ebeeef; }
	.wrap-login100 {
			max-width: 670px; height: auto; margin:48px auto;
			background: #fff; border-radius: 10px; overflow: hidden; position: relative;
	}
	.login100-form-title {
			width: 100%; position: relative; z-index: 1;
			display: flex; flex-wrap: wrap; flex-direction: column; align-items: center;
			background-repeat: no-repeat; background-size: cover; background-position: center;
			padding: 42px 15px 42px;
	}
	.login100-form-title::before {
			content: ""; display: block; position: absolute; z-index: -1;
			width: 100%; height: 100%; top: 0; left: 0;
			background-color: rgba(54,84,99,.7);
	}
	.login100-form-title-1 {
			font-size: 30px;
			color: #fff;
			text-transform: uppercase;
			line-height: 1.2;
			text-align: center;
	}
	.login100-logo {
			padding: 24px 32px 0px 32px;
	}
	.login100-form {
			display: flex; flex-wrap: wrap; justify-content: space-between;
			padding: 0px 32px 32px 32px;
	}
	.lock {
		width:32px; height: 32px; float:left; margin: 0 16px 0 0;
	}

	#mso365-login {
		margin: 16px auto; display: inline-block; border-radius: 5px;
		background: #eb3d01; color: white; white-space: nowrap;
		box-shadow: 2px 2px 2px grey; height: 44px;
	}
	#mso365-login .o365icon {
		background: url(/o365.png) transparent 5px 50% no-repeat;
		display: inline-block; vertical-align: middle;
		width: 42px; height: 42px; margin: 0 0px 0 16px;
	}
	#mso365-login .buttonText {
		display: inline-block; vertical-align: middle;
		padding-right: 24px;
	}
</style>