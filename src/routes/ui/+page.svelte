
<script>
import TopBar from './TopBar.svelte'
import DrawingNavigator from './DrawingNavigator.svelte'
import DrawingTabs from './DrawingTabs.svelte'
import CanvasView from './CanvasView.svelte'
import LayersPanel from './LayersPanel.svelte'
import StatusBar from './StatusBar.svelte'
</script>

<div class="h-screen flex flex-col">
  <TopBar />

  <div class="flex flex-1 overflow-hidden">
		<DrawingNavigator />
    <!--
		-->
    <CanvasView />
    <LayersPanel />
  </div>

  <DrawingTabs />
  <StatusBar />
</div>
