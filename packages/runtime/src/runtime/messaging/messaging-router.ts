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
  }

  public setupRoutes(router): void {
    router.post(
      '/receive',
      this.asyncMiddleware(async (req, res, next) => {
        if (!this.messaging.isExternal && req.headers.password !== process.INTERNAL_PASSWORD) {
          return next?.(new Error('Password is missing or invalid'))
        } else if (
          this.messaging.isExternal &&
          req.headers['x-webhook-token'] !== this.messaging.getWebhookToken(req?.body?.client?.id)
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

        const msg = req.body as ReceiveRequest

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
