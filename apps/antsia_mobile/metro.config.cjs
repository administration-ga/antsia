// Expo SDK 57 resolves workspaces and the isolated linker automatically.
const { getDefaultConfig } = require("expo/metro-config")

const config = getDefaultConfig(__dirname)
const defaults = config.resolver.blockList
// Generated Web output is never a native source. The SDK watches the Web
// workspaces too; crawling their live Next caches can stall an iPhone build.
config.resolver.blockList = [
  ...(Array.isArray(defaults) ? defaults : defaults ? [defaults] : []),
  /[/\\]\.next(?:-[^/\\]+)?(?:[/\\]|$)/,
  /[/\\](?:\.git|\.vercel|\.turbo)(?:[/\\]|$)/,
]
module.exports = config
