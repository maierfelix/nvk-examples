import structCache from "nvk-struct-cache";

export default {
  input: "index.mjs",
  output: {
    file: "./bundle.js",
    format: "cjs"
  },
  plugins: [
    structCache({ })
  ]
};
