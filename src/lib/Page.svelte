<script>
</script>

<div class="page">
	<slot name='fixed'></slot>
	<div class='page-content'>
		<slot></slot>
	</div>
</div>

<style>
  .page {
	box-sizing: border-box;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    transform: none;
    background-color: var(--f7-page-bg-color);
    z-index: 1;
  }
  .page-content {
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    box-sizing: border-box;
    height: 100%;
    position: relative;
    z-index: 1;
    padding-top: calc(var(--f7-page-navbar-offset, 0px) + var(--f7-page-toolbar-top-offset, 0px) + var(--f7-page-subnavbar-offset, 0px) + var(--f7-page-searchbar-offset, 0px) + var(--f7-page-content-extra-padding-top, 0px));
    padding-bottom: calc(var(--f7-page-toolbar-bottom-offset, 0px) + var(--f7-safe-area-bottom) + var(--f7-page-content-extra-padding-bottom, 0px));
}
</style>