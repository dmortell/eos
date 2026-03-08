<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { cn } from './utils';
  import Icon from './ui/Icon.svelte';

  type MetalVariant =
    | 'gold'
    | 'silver'
    | 'rose'
    | 'yellow'
    | 'cyan'
    | 'magenta'
    | 'red'
    | 'green';

  type MetalButtonProps = HTMLButtonAttributes & {
    variant?: MetalVariant;
    icon?: string;
    iconSize?: number;
    children?: Snippet;
  };

  let { class: className, variant = 'gold', icon, iconSize = 18, type = 'button', children, ...restProps }: MetalButtonProps = $props();
</script>

<button
  class={cn(
    'relative inline-flex items-center gap-1.5 cursor-pointer border-none',
    'text-gray-100 xxbg-transparent xxfont-semibold text-xs xxtracking-wider xxuppercase',
    'transition-all duration-150 hover:brightness-105 active:brightness-95',
    'disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2',
    className
  )}
  data-variant={variant}
  {type}
  {...restProps}
>
  <span class={cn('metal-ring relative p-0.5 rounded-xl', variant)}>
    <span class="metal-inner w-full h-full rounded-[10px] bg-[#0a0a0c] p-1 block">
      <div class="metal-face w-full h-full rounded-lg overflow-hidden relative grid place-items-center">
				<div class="flex gap-2 px-2">
					<Icon name={icon} size={iconSize} />
					{@render children?.()}
				</div>
      </div>
    </span>
  </span>
</button>

<style>

  .metal-ring {
    box-shadow: 0 0 0 2px #0d0d0f, 0 8px 24px rgba(0, 0, 0, 0.8);
    animation: metal-slide 6s linear infinite;
  }

  .metal-face {
    background: radial-gradient(ellipse at 38% 20%, #2c2c2e 0%, #1c1c1e 55%, #111 100%);
  }

  .metal-face::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 35% 18%, rgba(255, 255, 255, 0.07) 0%, transparent 60%);
    pointer-events: none;
  }

  .metal-face :global(svg) {
    color: rgba(255, 255, 255, 0.9);
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8));
    position: relative;
    z-index: 1;
  }

  /* Metal variants with animated gradients */
  .gold {
    background: linear-gradient(120deg, #1a0d00, #3d2600, #6b4200, #a06800, #c8880a, #a87020, #6b4200, #3d2600, #1a0d00, #3d2600, #6b4200, #a06800, #c8880a, #a87020, #6b4200, #1a0d00);
    background-size: 200% 100%;
  }

  .silver {
    background: linear-gradient(120deg, #0a0a0a, #222, #555, #888, #aaa, #888, #555, #222, #0a0a0a, #222, #555, #888, #aaa, #888, #555, #0a0a0a);
    background-size: 200% 100%;
  }

  .rose {
    background: linear-gradient(120deg, #1a0a08, #3d1810, #6b3028, #955048, #b87060, #955048, #6b3028, #3d1810, #1a0a08, #3d1810, #6b3028, #955048, #b87060, #955048, #6b3028, #1a0a08);
    background-size: 200% 100%;
  }

  .yellow {
    background: linear-gradient(120deg, #0a0800, #1f1a00, #3d3300, #706000, #f0c000, #ffe44d, #f0c000, #706000, #3d3300, #1f1a00, #3d3300, #706000, #f0c000, #ffe44d, #f0c000, #0a0800);
    background-size: 200% 100%;
    animation-duration: 4s;
    box-shadow: 0 0 0 2px #0d0d0f, 0 0 12px rgba(240, 192, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.8);
  }

  .yellow .metal-face {
    background: radial-gradient(ellipse at 38% 20%, #1a1800 0%, #0e0d00 55%, #080800 100%);
  }

  .yellow .metal-face :global(svg) {
    color: #f0c000;
    filter: drop-shadow(0 0 5px rgba(240, 192, 0, 0.9));
  }

  .cyan {
    background: linear-gradient(120deg, #000a0a, #001f1f, #003d3d, #007070, #00d4d4, #40ffff, #00d4d4, #007070, #003d3d, #001f1f, #003d3d, #007070, #00d4d4, #40ffff, #00d4d4, #000a0a);
    background-size: 200% 100%;
    animation-duration: 4s;
    box-shadow: 0 0 0 2px #0d0d0f, 0 0 12px rgba(0, 212, 212, 0.2), 0 8px 24px rgba(0, 0, 0, 0.8);
  }

  .cyan .metal-face {
    background: radial-gradient(ellipse at 38% 20%, #001818 0%, #000e0e 55%, #000808 100%);
  }

  .cyan .metal-face :global(svg) {
    color: #00d4d4;
    filter: drop-shadow(0 0 5px rgba(0, 212, 212, 0.9));
  }

  .magenta {
    background: linear-gradient(120deg, #0a0010, #200030, #450060, #800090, #cc00cc, #ff40ff, #cc00cc, #800090, #450060, #200030, #450060, #800090, #cc00cc, #ff40ff, #cc00cc, #0a0010);
    background-size: 200% 100%;
    animation-duration: 4s;
    box-shadow: 0 0 0 2px #0d0d0f, 0 0 12px rgba(220, 0, 220, 0.2), 0 8px 24px rgba(0, 0, 0, 0.8);
  }

  .magenta .metal-face {
    background: radial-gradient(ellipse at 38% 20%, #180020 0%, #0e0018 55%, #080010 100%);
  }

  .magenta .metal-face :global(svg) {
    color: #dd00dd;
    filter: drop-shadow(0 0 5px rgba(220, 0, 220, 0.9));
  }

  .red {
    background: linear-gradient(120deg, #0a0000, #200000, #500000, #900000, #dd0000, #ff4040, #dd0000, #900000, #500000, #200000, #500000, #900000, #dd0000, #ff4040, #dd0000, #0a0000);
    background-size: 200% 100%;
    animation-duration: 4s;
    box-shadow: 0 0 0 2px #0d0d0f, 0 0 12px rgba(220, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.8);
  }

  .red .metal-face {
    background: radial-gradient(ellipse at 38% 20%, #1a0000 0%, #0e0000 55%, #080000 100%);
  }

  .red .metal-face :global(svg) {
    color: #ff3030;
    filter: drop-shadow(0 0 5px rgba(255, 40, 40, 0.9));
  }

  .green {
    background: linear-gradient(120deg, #000a00, #001500, #003000, #006000, #00bb00, #40ff40, #00bb00, #006000, #003000, #001500, #003000, #006000, #00bb00, #40ff40, #00bb00, #000a00);
    background-size: 200% 100%;
    animation-duration: 4s;
    box-shadow: 0 0 0 2px #0d0d0f, 0 0 12px rgba(0, 187, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.8);
  }

  .green .metal-face {
    background: radial-gradient(ellipse at 38% 20%, #001800 0%, #000e00 55%, #000800 100%);
  }

  .green .metal-face :global(svg) {
    color: #00cc00;
    filter: drop-shadow(0 0 5px rgba(0, 200, 0, 0.9));
  }

  @keyframes metal-slide {
    from {
      background-position: 0% 50%;
    }
    to {
      background-position: 200% 50%;
    }
  }
</style>