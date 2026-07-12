'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { pathToFileURL } = require('url');

function on(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('deepdesk', {
  timer: {
    getState: () => ipcRenderer.invoke('timer:getState'),
    start: (intent, taskId) => ipcRenderer.invoke('timer:start', { intent, taskId }),
    pause: () => ipcRenderer.invoke('timer:pause'),
    resume: () => ipcRenderer.invoke('timer:resume'),
    skip: () => ipcRenderer.invoke('timer:skip'),
    reset: () => ipcRenderer.invoke('timer:reset'),
    onState: (cb) => on('timer:state', cb),
    onEvent: (cb) => on('timer:event', cb),
  },
  store: {
    getSettings: () => ipcRenderer.invoke('store:getSettings'),
    setSettings: (partial) => ipcRenderer.invoke('store:setSettings', partial),
    getTasks: () => ipcRenderer.invoke('store:getTasks'),
    setTasks: (tasks) => ipcRenderer.invoke('store:setTasks', tasks),
    getSessions: () => ipcRenderer.invoke('store:getSessions'),
    getStats: () => ipcRenderer.invoke('store:getStats'),
    onChanged: (cb) => on('data:changed', cb),
    onSettingsChanged: (cb) => on('settings:changed', cb),
  },
  music: {
    get: () => ipcRenderer.invoke('music:get'),
    setPrefs: (partial) => ipcRenderer.invoke('music:setPrefs', partial),
    import: () => ipcRenderer.invoke('music:import'),
    addPaths: (paths) => ipcRenderer.invoke('music:addPaths', paths),
    remove: (id) => ipcRenderer.invoke('music:remove', id),
    move: (fromIndex, toIndex) => ipcRenderer.invoke('music:move', { fromIndex, toIndex }),
    getLofiPack: () => ipcRenderer.invoke('music:getLofiPack'),
    // Drag-drop helpers: File objects can't cross the bridge, paths/URLs can.
    pathForFile: (file) => webUtils.getPathForFile(file),
    fileUrl: (p) => pathToFileURL(p).href,
  },
  mini: {
    setExpanded: (expanded) => ipcRenderer.send('mini:setExpanded', !!expanded),
    showMain: () => ipcRenderer.send('mini:showMain'),
  },
});
