Minimal runtime. No modules, minimal SDK methods.

To use, create a .env file with these keys:

- MANAGE_API_KEY=abc123
- MESSAGING_ENDPOINT=http://localhost:3100
- NLU_ENDPOINT=http://localhost:3200

There are two routes: import and delete bot. See `api.rest` for examples

## Removed methods from the SDK

### Realtime

- realtime.sendPayload
- realtime.getVisitorIdFromGuestSocketId

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
