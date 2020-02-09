<script>
  import { createEventDispatcher } from "svelte";
  export let colorNumber = 0;
  export let sliderColor;
  const dispatch = createEventDispatcher();
  $: dispatch("color", colorNumber);
</script>

<style>
  .slider {
    -webkit-appearance: none;
    width: 100%;
    height: 25px;
    background: #d3d3d3;
    outline: none;
    opacity: 0.7;
    -webkit-transition: 0.2s;
    transition: opacity 0.2s;
  }

  .slider:hover {
    opacity: 1;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 25px;
    height: 25px;
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    width: 25px;
    height: 25px;
    cursor: pointer;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 25px;
    height: 25px;
    background: var(--color);
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    width: 25px;
    height: 25px;
    background: var(--color);
    cursor: pointer;
  }
</style>

<input
  type="range"
  style="--color:{sliderColor}"
  min="0"
  bind:value={colorNumber}
  max="255"
  class="slider" />
