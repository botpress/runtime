import { Message } from '@botpress/messaging-client'
import * as sdk from 'botpress/sdk'

import { Router } from 'express'
import joi from 'joi'
import { HTTPServer } from 'runtime/app/server'
import { CustomRouter } from 'runtime/app/server-utils'

import { MessagingService } from './messaging-service'

export class MessagingRouter extends CustomRouter {
  constructor(private logger: sdk.Logger, private messaging: MessagingService, private http: HTTPServer) {
    super('Messaging', logger, Router({ mergeParams: true }))
    this.setupRoutes()
  }

  public setupRoutes(): void {
    this.router.post(
      '/receive',
      this.asyncMiddleware(async (req, res, next) => {
        const msg = await joi.validate<ReceiveRequest>(req.body, ReceiveSchema)

        if (!this.messaging.isExternal) {
          return next?.(new Error('Messaging must be external'))
        } else if (
          this.messaging.isExternal &&
          (!req.headers['x-webhook-token'] ||
            req.headers['x-webhook-token'] !== this.messaging.getWebhookToken(msg.data.clientId))
        ) {
          return next?.(new Error('Invalid webhook token'))
        }

        if (req.body?.type !== 'message.new') {
          return res.sendStatus(200)
        }

        try {
          await joi.validate(req.body, ReceiveSchema)
        } catch (err) {
          throw new Error('Invalid payload')
        }

        await this.messaging.receive({
          clientId: msg.data.clientId,
          channel: msg.data.channel,
          userId: msg.data.userId,
          conversationId: msg.data.conversationId,
          messageId: msg.data.message.id,
          payload: msg.data.message.payload
        })

        res.sendStatus(200)
      })
    )
  }
}

interface ReceiveRequest {
  type: string
  data: {
    clientId: string
    userId: string
    conversationId: string
    channel: string
    message: Message
  }
}

const ReceiveSchema = {
  type: joi.string().required(),
  data: joi
    .object({
      clientId: joi.string().required(),
      userId: joi.string().required(),
      conversationId: joi.string().required(),
      channel: joi.string().required(),
      message: joi
        .object({
          id: joi.string().required(),
          conversationId: joi.string().required(),
          authorId: joi.string().required(),
          sentOn: joi.date().required(),
          payload: joi.object().required()
        })
        .required()
    })
    .required()
}
