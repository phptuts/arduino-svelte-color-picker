<script>
  import Slider from "./Slider.svelte";
  let redColor = 20;
  let blueColor = 0;
  let greenColor = 0;
  let writer;
  function updateRed(e) {
    redColor = e.detail;
  }
  function updateBlue(e) {
    blueColor = e.detail;
  }
  function updateGreen(e) {
    greenColor = e.detail;
  }

  async function connect() {
    const port = await navigator.serial.requestPort();

    await port.open({
      baudrate: 115200
    });
    console.log(port.writable);
    writer = port.writable.getWriter();
  }

  $: colorCss = `rgb(${redColor}, ${greenColor}, ${blueColor})`;

  $: arduinoColor = `${redColor}:${greenColor}:${blueColor}|`;

  $: if (writer && arduinoColor) {
    const enc = new TextEncoder(); // always utf-8
    writer.write(enc.encode(arduinoColor));
  }
</script>

<style>
  #color_picker {
    width: 100%;
    height: 300px;
    border: solid black 2px;
  }
</style>

<main>
  <h1>Arduino Color Picker</h1>
  <button on:click={connect}>Connect To Arduino</button>
  <Slider
    min="0"
    max="0"
    colorNumber="50"
    sliderColor="#AA0000"
    on:color={updateRed} />

  <Slider
    min="0"
    max="0"
    colorNumber="0"
    sliderColor="#00AA00"
    on:color={updateGreen} />

  <Slider
    min="0"
    max="0"
    colorNumber="0"
    sliderColor="#0000AA"
    on:color={updateBlue} />

  <section style="background: {colorCss}" id="color_picker" />
</main>
