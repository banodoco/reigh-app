// NAME: Chromatic Glitch Storm
// DESCRIPTION: RGB channel separation with glitch noise blocks
// PARAMS: [{"name":"drift","label":"Drift","description":"How far the RGB channels separate (% of width)","type":"number","default":1,"min":0,"max":5,"step":0.1},{"name":"flicker","label":"Flicker Speed","description":"Speed of the chromatic animation","type":"number","default":4,"min":0.5,"max":12,"step":0.5},{"name":"noise","label":"Noise Amount","description":"Density of glitch noise blocks","type":"number","default":0.03,"min":0,"max":0.1,"step":0.005}]

const ChromaticGlitchStorm = ({
  children,
  durationInFrames,
  params
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  // Drift is now a percentage of composition width — looks consistent at any resolution
  var driftPct = Number(params?.drift ?? 1);
  var drift = width * driftPct / 100;
  var flicker = Number(params?.flicker ?? 4);
  var noise = Number(params?.noise ?? 0.03);

  var glitchPhase = (frame * flicker) / fps;
  var redOffsetX = Math.sin(glitchPhase * 1.7) * drift;
  var redOffsetY = Math.cos(glitchPhase * 2.3) * drift * 0.6;
  var greenOffsetX = Math.sin(glitchPhase * 2.1 + 1) * drift;
  var greenOffsetY = Math.cos(glitchPhase * 1.9 + 1) * drift * 0.6;
  var blueOffsetX = Math.sin(glitchPhase * 2.5 + 2) * drift;
  var blueOffsetY = Math.cos(glitchPhase * 2.7 + 2) * drift * 0.6;

  var noiseBlocks = Math.floor(noise * 100);
  var blocks = [];
  for (var i = 0; i < noiseBlocks; i++) {
    var seed = (frame + i * 137.5) * 0.1;
    var left = Math.abs(Math.sin(seed * 1.3)) * 100;
    var top = Math.abs(Math.cos(seed * 1.7)) * 100;
    var w = Math.abs(Math.sin(seed * 2.1)) * 4 + 1;
    var h = Math.abs(Math.cos(seed * 3.1)) * 4 + 1;
    var hue = Math.abs(Math.sin(seed * 0.5)) * 360;
    blocks.push(
      React.createElement("div", {
        key: i,
        style: {
          position: "absolute",
          left: left + "%",
          top: top + "%",
          width: w + "%",
          height: h + "%",
          backgroundColor: "hsl(" + hue + ", 100%, 50%)",
          mixBlendMode: "screen",
          opacity: 0.7,
          pointerEvents: "none"
        }
      })
    );
  }

  // Channel isolation via CSS mix-blend-mode: multiply
  // multiply(content, #ff0000) = (r*1, g*0, b*0) = red channel only
  // isolation:isolate scopes the multiply to only affect siblings within each layer
  // screen blend recombines the three channels — overlap area = original image,
  // offset edges show chromatic fringing

  // Black backdrop ensures transparent areas (objectFit:contain letterboxing)
  // produce black after multiply, not the overlay color. Without this,
  // multiply(red, transparent) = solid red → screen(red,green,blue) = white.
  function makeChannelLayer(offsetX, offsetY, tintColor, key) {
    return React.createElement(
      "div",
      {
        key: key,
        style: {
          position: "absolute",
          inset: 0,
          isolation: "isolate",
          mixBlendMode: "screen",
          transform: "translate(" + offsetX + "px, " + offsetY + "px)"
        }
      },
      React.createElement("div", {
        style: {
          position: "absolute",
          inset: 0,
          background: "#000000",
          pointerEvents: "none"
        }
      }),
      children,
      React.createElement("div", {
        style: {
          position: "absolute",
          inset: 0,
          background: tintColor,
          mixBlendMode: "multiply",
          pointerEvents: "none"
        }
      })
    );
  }

  return React.createElement(
    AbsoluteFill,
    null,
    React.createElement(
      "div",
      { style: { position: "relative", width: "100%", height: "100%" } },
      makeChannelLayer(redOffsetX, redOffsetY, "#ff0000", "r"),
      makeChannelLayer(greenOffsetX, greenOffsetY, "#00ff00", "g"),
      makeChannelLayer(blueOffsetX, blueOffsetY, "#0000ff", "b"),
      ...blocks
    )
  );
};

exports.default = ChromaticGlitchStorm;
