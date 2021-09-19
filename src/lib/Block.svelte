<script>
</script>

<div class="block">
	<slot></slot>
</div>

<style>
	.block {
    box-sizing: border-box;
    position: relative;
    z-index: 1;
    color: var(--f7-block-text-color);
    margin: var(--f7-block-margin-vertical) 0;
    padding-top: 0;
    padding-bottom: 0;
    padding-left: calc(var(--f7-block-padding-horizontal) + var(--f7-safe-area-left));
    padding-right: calc(var(--f7-block-padding-horizontal) + var(--f7-safe-area-right));
    font-size: var(--f7-block-font-size);
}
</style>