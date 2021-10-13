import { inject, injectable } from 'inversify'
import { GhostService } from 'runtime/bpfs'
import { TYPES } from 'runtime/types'

import { MediaService } from './media-service-interface'
import { GhostMediaService } from './providers/ghost-media-service'

@injectable()
export class MediaServiceProvider {
  private _scopeServices: Dic<MediaService> = {}
  private GLOBAL_KEY = '__GLOBAL_MEDIA__'

  // TODO add backend config
  constructor(@inject(TYPES.GhostService) private ghostProvider: GhostService) {}

  global() {
    if (!this._scopeServices[this.GLOBAL_KEY]) {
      this._scopeServices[this.GLOBAL_KEY] = new GhostMediaService(this.ghostProvider)
    }
    return this._scopeServices[this.GLOBAL_KEY]
  }

  forBot(botId: string) {
    if (!this._scopeServices[botId]) {
      this._scopeServices[botId] = new GhostMediaService(this.ghostProvider, botId)
    }
    return this._scopeServices[botId]
  }
}
