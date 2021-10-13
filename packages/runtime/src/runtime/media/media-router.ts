import * as sdk from 'botpress/runtime-sdk'

import { Router } from 'express'
import _ from 'lodash'
import ms from 'ms'
import path from 'path'
import { CustomRouter } from 'runtime/app/server-utils'

import { MediaServiceProvider } from './media-service-provider'

const ONE_YEAR_SEC = ms('1y') / 1000

// This uses the same "interface" as the Bot Media router
export class MediaRouter extends CustomRouter {
  constructor(logger: sdk.Logger, private mediaServiceProvider: MediaServiceProvider) {
    super('Media', logger, Router({ mergeParams: true }))
    this.setupPublicRoutes()
  }

  private setupPublicRoutes() {
    this.router.get(
      '/:filename',
      this.asyncMiddleware(async (req, res) => {
        const botId = req.params.botId
        const type = path.extname(req.params.filename)

        const mediaService = this.mediaServiceProvider.forBot(botId)
        const contents = await mediaService.readFile(req.params.filename).catch(() => undefined)
        if (!contents) {
          return res.sendStatus(404)
        }

        // files are never overwritten because of the unique ID
        // so we can set the header to cache the asset for 1 year
        return res
          .set({ 'Cache-Control': `max-age=${ONE_YEAR_SEC}` })
          .type(type)
          .send(contents)
      })
    )
  }
}
