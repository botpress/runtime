import { MessagingClient } from '@botpress/messaging-client'
import { IO, Logger, MessagingConfig } from 'botpress/runtime-sdk'
import { formatUrl, isBpUrl } from 'common/url'
import { inject, injectable, postConstruct } from 'inversify'
import { ConfigProvider } from 'runtime/config'
import { EventEngine, Event } from 'runtime/events'
import { TYPES } from 'runtime/types'
import { MessageNewEventData } from './messaging-router'

@injectable()
export class MessagingService {
  private clientSync!: MessagingClient
  private clientsByBotId: { [botId: string]: MessagingClient } = {}
  private botsByClientId: { [clientId: string]: string } = {}
  private webhookTokenByClientId: { [botId: string]: string } = {}
  private channelNames = ['messenger', 'slack', 'smooch', 'teams', 'telegram', 'twilio', 'vonage']
  private newUsers: number = 0

  public isExternal: boolean
  public internalPassword: string | undefined

  constructor(
    @inject(TYPES.EventEngine) private eventEngine: EventEngine,
    @inject(TYPES.ConfigProvider) private configProvider: ConfigProvider,
    @inject(TYPES.Logger) private logger: Logger
  ) {
    this.isExternal = Boolean(process.core_env.MESSAGING_ENDPOINT)
  }

  async initialize() {
    this.eventEngine.register({
      name: 'messaging.sendOut',
      description: 'Sends outgoing messages to external messaging',
      order: 20000,
      direction: 'outgoing',
      handler: this.handleOutgoingEvent.bind(this)
    })

    this.clientSync = new MessagingClient({ url: this.getMessagingUrl() })
    this.logger.info(`Using Messaging server at ${this.getMessagingUrl()}`)
  }

  async loadMessagingForBot(botId: string) {
    const config = await this.configProvider.getBotConfig(botId)
    const messaging = (config.messaging || {}) as Partial<MessagingConfig>

    const messagingId = messaging.id || ''
    // ClientId is already used by another botId, we will generate new ones for this bot
    if (this.botsByClientId[messagingId] && this.botsByClientId[messagingId] !== botId) {
      this.logger.warn(
        `ClientId ${messagingId} already in use by bot ${this.botsByClientId[messagingId]}. Removing channels configuration and generating new credentials for bot ${botId}`
      )
      delete messaging.id
      delete messaging.token
      delete messaging.channels
    }

    const webhookUrl = `${process.EXTERNAL_URL}/api/v1/chat/receive`
    const setupConfig = {
      name: botId,
      ...messaging,
      // We use the SPINNED_URL env var to force the messaging server to make its webhook
      // requests to the process that started it when using a local Messaging server
      webhooks: this.isExternal ? [{ url: webhookUrl }] : []
    }

    const { id, token, webhooks } = await this.clientSync.syncs.sync(setupConfig)

    if (webhooks?.length) {
      for (const webhook of webhooks) {
        if (webhook.url === webhookUrl) {
          this.webhookTokenByClientId[id] = webhook.token!
        }
      }
    }

    const botClient = new MessagingClient({
      url: this.getMessagingUrl(),
      auth: { clientId: messaging.id!, clientToken: messaging.token! }
    })
    this.clientsByBotId[botId] = botClient
    this.botsByClientId[id] = botId
  }

  async unloadMessagingForBot(botId: string) {
    const config = await this.configProvider.getBotConfig(botId)
    if (!config.messaging?.id) {
      return
    }

    delete this.botsByClientId[config.messaging.id]

    await this.clientSync.syncs.sync({
      id: config.messaging.id,
      token: config.messaging.token,
      name: botId,
      channels: {},
      webhooks: []
    })
  }

  async receive(event: MessageNewEventData) {
    return this.eventEngine.sendEvent(
      Event({
        direction: 'incoming',
        type: event.message.payload.type,
        payload: event.message.payload,
        channel: event.channel,
        threadId: event.conversationId,
        target: event.userId,
        messageId: event.message.id,
        botId: this.botsByClientId[event.clientId]
      })
    )
  }

  private async handleOutgoingEvent(event: IO.OutgoingEvent, next: IO.MiddlewareNextCallback) {
    if (!this.channelNames.includes(event.channel)) {
      return next(undefined, false, true)
    }

    const payloadAbsoluteUrl = this.convertToAbsoluteUrls(event.payload)
    const message = await this.clientsByBotId[event.botId].messages.create(
      event.threadId!,
      undefined,
      payloadAbsoluteUrl
    )
    event.messageId = message.id

    return next(undefined, true, false)
  }

  private convertToAbsoluteUrls(payload: any) {
    if (typeof payload !== 'object' || payload === null) {
      if (typeof payload === 'string') {
        payload = payload.replace('BOT_URL', process.EXTERNAL_URL)
      }

      if (isBpUrl(payload)) {
        return formatUrl(process.EXTERNAL_URL, payload)
      }
      return payload
    }

    for (const [key, value] of Object.entries(payload)) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = this.convertToAbsoluteUrls(value[i])
        }
      } else {
        payload[key] = this.convertToAbsoluteUrls(value)
      }
    }

    return payload
  }

  public getMessagingUrl() {
    return process.core_env.MESSAGING_ENDPOINT!
  }

  public getWebhookToken(clientId: string) {
    return this.webhookTokenByClientId[clientId]
  }

  public getNewUsersCount({ resetCount }: { resetCount: boolean }) {
    const count = this.newUsers
    if (resetCount) {
      this.newUsers = 0
    }
    return count
  }

  public incrementNewUsersCount() {
    this.newUsers++
  }
}
