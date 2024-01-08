// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CopyPlugin = require("copy-webpack-plugin");

// eslint-disable-next-line no-undef
const rootDir = path.join(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const entryDir = path.join(srcDir, "entry");
const copyCommonPattern = { globOptions: { ignore: ["**/.DS_Store"] } };

module.exports = {
  entry: {
    content: path.join(entryDir, "content.ts"),
    background: path.join(entryDir, "background.ts"),
    option: path.join(entryDir, "option.ts"),
    popup: path.join(entryDir, "popup.tsx"),
    offscreen: path.join(entryDir, "offscreen.ts"),
  },
  output: {
    clean: true,
    path: path.join(rootDir, "dist"),
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        // .ts, .tsx
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js", ".tsx"],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          ...copyCommonPattern,
          from: path.join(rootDir, "public"),
          to: path.join(rootDir, "dist"),
        },
        {
          ...copyCommonPattern,
          from: path.join(srcDir, "view", "css"),
          to: path.join(rootDir, "dist", "css"),
        },
        {
          ...copyCommonPattern,
          from: path.join(srcDir, "view", "html"),
          to: path.join(rootDir, "dist", "html"),
        },
      ],
    }),
  ],
};
