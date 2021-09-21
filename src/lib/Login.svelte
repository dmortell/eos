<script>
	// import {Block, Button, Icon, Navbar, Page, Row, Col} from 'framework7-svelte'
	import {Row, Col, Button} from 'svelte-chota'
	import {session, alert} from '$js/stores'
	import Alert from '$lib/Alert.svelte'

	const login = () => {
		$alert = "logging in"
		// session.signin((result, err)=>{
		// 	if (err){
		// 		console.log(err)
		// 		console.log(err.qa)
		// 		$alert = "Signin error"
		// 	}
		// })		// callback, provider='microsoft.com', options={}
		session.microsoftSignin(true)
	}
	//https://preview.colorlib.com/theme/bootstrap/login-form-05/
</script>
<!-- <Page> -->
	<div class="container-login100">
		<div class="wrap-login100">
			<div class="login100-form-title" style="background-image: url(https://colorlib.com/etc/lf/Login_v15/images/bg-01.jpg);">
				<span class="login100-form-title-1">Sign In</span>
			</div>
			<!-- <Block></Block> -->
			<div class="login100-logo">
				<img src="/logo.gif" alt="Eire Logo"/>
			</div>
				<div class="login100-form">
					<p>Single Sign On with your Office 365 work account.</p>

      <!-- seperator -->
      <div class="flex flex-row justify-center mb-8">
        <span class="absolute bg-white px-4 text-gray-500">or sign-in with</span>
        <div class="w-full bg-gray-200 mt-3 h-px"></div>
      </div>
	  
					<Row>
						<Col width=80>
							Microsoft Authenticator is required on your smartphone if two-factor authentication is enabled.
						</Col>
						<Col width=20>
							<img src="./authenticator.webp" width=32 alt="Microsoft Authenticator"  />
						</Col>
					</Row>
					<a on:click={login} disabled={$session.loading} href="#login" id="mso365-login"><span class="o365icon"/> <span class="buttonText">Sign in with Office 365</span></a>
				</div>
			<!-- <Button fill preloader loading={$session.loading} onClick={session.microsoftSignin}><Icon icon="arrow_right_circle"/> Login</Button> -->
		</div>
	</div>

	<Alert />
<!-- </Page> -->

<style>
.container-login100 {
    min-height: 100vh;
    display: -webkit-box;
    display: -webkit-flex;
    display: -moz-box;
    display: -ms-flexbox;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    /* align-items: center; */
    background: #ebeeef;
}
.wrap-login100 {
    max-width: 670px;
    /* max-height: 100%; */
	height: auto;
	/* margin-top:48px; */
	margin:48px auto;
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
    position: relative;
}
.login100-form-title {
    width: 100%;
    position: relative;
    z-index: 1;
    display: -webkit-box;
    display: -webkit-flex;
    display: -moz-box;
    display: -ms-flexbox;
    display: flex;
    flex-wrap: wrap;
    flex-direction: column;
    align-items: center;
    background-repeat: no-repeat;
    background-size: cover;
    background-position: center;
    padding: 42px 15px 42px;
}
.login100-form-title::before {
    content: "";
    display: block;
    position: absolute;
    z-index: -1;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
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
    padding: 0px 32px 0px 32px;

}
.login100-form {
    display: -webkit-box;
    display: -webkit-flex;
    display: -moz-box;
    display: -ms-flexbox;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    padding: 0px 32px 32px 32px;
}

	#mso365-login {
		margin-top: 16px;
		display: inline-block;
		border-radius: 5px;
		background: #eb3d01;
		color: white;
		white-space: nowrap;
		box-shadow: 1px 1px 1px grey;
		height: 44px;
	}
	#mso365-login .o365icon {
		background: url(./microsoft-365.png) transparent 5px 50% no-repeat;
		display: inline-block;
		width: 42px;
		height: 42px;
		vertical-align: middle;
		margin: 0 0px 0 16px;
	}
	#mso365-login .buttonText {
		display: inline-block;
		vertical-align: middle;
		padding-right: 24px;
	}
</style>