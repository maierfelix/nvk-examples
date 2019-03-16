import fs from "fs";
import { GLSL } from "nvk-essentials";

const watchPath = `./shaders/`;

function onFileChange(e) {
  console.log("Reloading shaders..");
  let vertexShader = GLSL.toSPIRVSync({
    source: fs.readFileSync(`./shaders/example.vert`),
    extension: `vert`
  });
  let fragmentShader = GLSL.toSPIRVSync({
    source: fs.readFileSync(`./shaders/example.frag`),
    extension: `frag`
  });
  if (vertexShader.error) {
    return console.error(`Error in vertex shader:`, vertexShader.error);
  }
  if (fragmentShader.error) {
    return console.error(`Error in vertex shader:`, fragmentShader.error);
  }
  console.log(`Vertex shader byteLength: ${vertexShader.output.byteLength}`);
  console.log(`Fragment shader byteLength: ${fragmentShader.output.byteLength}`);
};

fs.watch(watchPath, { recursive: true }, e => onFileChange(e));

console.log(`Listening for changes in ${watchPath}`);
