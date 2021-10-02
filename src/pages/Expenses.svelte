<script>

</script>


<div class="max-w-lg p-10 bg-white rounded shadow-xl">
  <h1 class="mb-4 text-3xl font-black">Expenses</h1>
  <!-- <form>
    <div class="relative mb-4">
      <input use:labelToggle class="removed-for-readability" id="email" type="text" />
      <label use:labelClick for="email" class="removed-for-readability">Email</label>
    </div>
    <div class="relative mb-4">
      <input use:labelToggle class="removed-for-readability" />
      <label use:labelClick for="password" class="removed-for-readability">Password</label>
    </div>
    <div class="text-center">
      <button class="removed-for-readability">Continue</button>
    </div>
  </form> -->
</div>

<style>
	.input {
			transition: border 0.2s ease-in-out;
			min-width: 280px
	}

	.input:focus+.label,
	.input:active+.label,
	.input.filled+.label {
			font-size: .75rem;
			transition: all 0.2s ease-out;
			top: -0.1rem;
			color: #667eea;
	}

	.label {
			transition: all 0.2s ease-out;
			top: 0.4rem;
			left: 0;
	}
</style>
