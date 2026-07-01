const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cypher', {
  version:  require('./package.json').version,
  platform: process.platform,

  /**
   * Register a callback for the global voice toggle hotkey (Cmd+Shift+Space).
   * The main process sends 'voice-toggle' via IPC when the hotkey fires.
   * Call this once from the React voice hook.
   */
  onVoiceToggle: (callback) => {
    ipcRenderer.on('voice-toggle', () => callback());
  },
});
