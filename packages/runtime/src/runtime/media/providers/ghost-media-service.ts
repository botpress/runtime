import { ScopedGhostService } from 'botpress/runtime-sdk'
import nanoid from 'nanoid/generate'
import { GhostService } from 'runtime/bpfs'
import { sanitize } from 'runtime/misc/utils'

import { MediaService } from '../media-service-interface'

const debug = DEBUG('media')

export class GhostMediaService implements MediaService {
  private MEDIA_DIR = 'media'
  private ghost: ScopedGhostService
  constructor(ghostProvider: GhostService, private botId?: string) {
    this.ghost = this.botId ? ghostProvider.forBot(this.botId) : ghostProvider.global()
  }

  async readFile(fileName: string): Promise<Buffer> {
    this.debug(`Reading media ${fileName}`)
    return this.ghost.readFileAsBuffer(this.MEDIA_DIR, sanitize(fileName))
  }

  private debug(message: string) {
    if (this.botId) {
      debug.forBot(this.botId, message)
    } else {
      debug(message)
    }
  }

  getPublicURL(fileName: string): string {
    // make sure the file name is a valid URI
    fileName = encodeURIComponent(fileName)
    if (this.botId) {
      return `/api/v1/bots/${this.botId}/media/${fileName}`
    } else {
      return `/api/v1/media/${fileName}`
    }
  }
}
