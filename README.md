Minimal runtime. No modules, minimal SDK methods.

To use, create a .env file with these keys:

- MANAGE_API_KEY=abc123
- MESSAGING_ENDPOINT=http://localhost:3100
- NLU_ENDPOINT=http://localhost:3200

There are two routes: import and delete bot. See `api.rest` for examples

\*\* Main repo last commit sync: cf93a1616ca512deaa0ec4e9fa81526e97cbf7bc

## Removed methods from the SDK

These methods are no longer part of the "runtime sdk".

### Realtime

- realtime.sendPayload
- realtime.getVisitorIdFromGuestSocketId

### Ghost

- ghost.(forBot|forBots|forGlobal|forRoot).upsertFile
- ghost.(forBot|forBots|forGlobal|forRoot).deleteFile
- ghost.(forBot|forBots|forGlobal|forRoot).renameFile

### HTTP

- http.createShortLink
- http.deleteShortLink
- http.createRouterForBot
- http.deleteRouterForBot
- http.getAxiosConfigForBot
- http.decodeExternalToken
- http.extractExternalToken
- http.needPermission
- http.hasPermission

### Dialog

- dialog.getConditions

### Config

- config.getModuleConfig
- config.getModuleConfigForBot
- config.mergeBotConfig

### Bots

- bots.exportBot
- bots.importBot
- bots.listBotRevisions
- bots.createBotRevision
- bots.rollbackBotToRevision

### Workspaces

- workspaces.getBotWorkspaceId
- workspaces.addUserToWorkspace
- workspaces.getWorkspaceRollout
- workspaces.consumeInviteCode
- workspaces.getWorkspaceUsers

### CMS

- cms.deleteContentElements
- cms.createOrUpdateContentElement
- cms.saveFile
- cms.readFile
- cms.getFilePath

### Experimental

- experimental.disableHook
- experimental.enableHook
