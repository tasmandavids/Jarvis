const { contextBridge } = require('electron');

// Expose app version to the renderer
contextBridge.exposeInMainWorld('cypher', {
  version: require('./package.json').version,
  platform: process.platform,
});
