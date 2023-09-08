const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

const rootDir = path.join(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const copyCommonPattern = { globOptions: { ignore: ["**/.DS_Store"] } };

module.exports = {
  entry: {
    content: path.join(srcDir, "content.ts"),
    background: path.join(srcDir, "background.ts"),
    // option: path.join(srcDir, 'option.ts'),
    popup: path.join(srcDir, "popup.ts"),
    offscreen: path.join(srcDir, "offscreen.ts"),
  },
  output: {
    clean: true,
    path: path.join(rootDir, "dist"),
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
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
