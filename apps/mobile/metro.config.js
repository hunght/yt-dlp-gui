const path = require("path");
const {
  wrapWithReanimatedMetroConfig,
} = require("react-native-reanimated/metro-config");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const mobileNodeModules = path.resolve(__dirname, "node_modules");
config.watchFolders = [
  path.resolve(__dirname, "../shared"),
];
config.resolver.nodeModulesPaths = [mobileNodeModules];

// Resolve react-dom/client to empty module for native builds
// This fixes the @expo/log-box incorrectly importing web dependencies
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "android" &&
    moduleName === "react-dom/client"
  ) {
    return {
      type: "empty",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = wrapWithReanimatedMetroConfig(config);
