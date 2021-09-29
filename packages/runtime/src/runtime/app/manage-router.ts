import * as sdk from 'botpress/sdk'

import { Router } from 'express'
import joi from 'joi'
import { HTTPServer } from 'runtime/app/server'
import { CustomRouter } from 'runtime/app/server-utils'
import { BotService } from 'runtime/bots'

export class ManageRouter extends CustomRouter {
  constructor(private logger: sdk.Logger, private botService: BotService, private http: HTTPServer) {
    super('ManageRouter', logger, Router({ mergeParams: true }))
  }

  public setupRoutes(): void {
    this.router.post(
      '/:botId/import',
      this.asyncMiddleware(async (req, res) => {
        if (!req.is('application/tar+gzip')) {
          return res.status(400).send('Bot should be imported from archive')
        }

        const buffers: any[] = []
        req.on('data', chunk => buffers.push(chunk))
        await Promise.fromCallback(cb => req.on('end', cb))

        await this.botService.importBot(req.params.botId, Buffer.concat(buffers), true)
        res.sendStatus(200)
      })
    )

    this.router.post(
      '/:botId/delete',
      this.asyncMiddleware(async (req, res) => {
        const { botId } = req.params

        await this.botService.deleteBot(botId)
        res.sendStatus(200)
      })
    )
  }
}
