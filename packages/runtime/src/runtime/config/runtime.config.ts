import { ConverseConfig } from 'botpress/sdk'

export type BotpressCondition = '$isProduction' | '$isDevelopment'

export interface DialogConfig {
  /**
   * Interval between executions of the janitor that checks for stale contexts and sessions.
   * @default 10s
   */
  janitorInterval: string
  /**
   * Interval before a session's context expires.
   * e.g. when the conversation is stale and has not reached the END of the flow.
   * This will reset the position of the user in the flow.
   * @default 2m
   */
  timeoutInterval: string
  /**
   * Interval before a session expires. e.g. when the user has not spoken for a while.
   * The session including its variable will be deleted.
   * @default 30m
   */
  sessionTimeoutInterval: string
}

export interface LogsConfig {
  /**
   * The database output will not record Debug logs.
   */
  dbOutput: {
    /**
     * Logs will be kept for this amount of time in the database
     * @default 2 weeks
     */
    expiration: string
    /**
     * @default 30s
     */
    janitorInterval: string
  }
  /**
   * The file output records everything that is displayed in the console logs.
   */
  fileOutput: {
    /**
     * Enable or disable the output of logs to the file system. A new file is created each day
     * @default false
     */
    enabled: boolean
    /**
     * The path (relative or absolute) to the logs folder.
     * @default ./
     */
    folder: string
    /**
     * The maximum file size that the log can reach before a new one is started (size in kb)
     * @default 10000
     */
    maxFileSize: number
  }
}

/**
 * Many configuration options allows you to specify textually the duration, interval, etc.
 * We use the library "ms", so head over to this page to see supported formats: https://www.npmjs.com/package/ms
 */

export interface RuntimeConfig {
  httpServer?: {
    /**
     * @default localhost
     */
    host: string
    /**
     * @default 3000
     */
    port: number
    /**
     * There are three external URLs that Botpress calls: https://license.botpress.io, https://duckling.botpress.io and https://lang-01.botpress.io
     * If you are behind a corporate proxy, you can configure it below.
     * It is also possible to self-host Duckling, please check the documentation
     *
     * @example http://username:password@hostname:port
     */
    proxy?: string
    /**
     * @default 0
     */
    backlog: number
    /**
     * @default 10mb
     */
    bodyLimit: string | number
    /**
     * CORS policy for the server. You can provide other configuration parameters
     * listed on this page: https://expressjs.com/en/resources/middleware/cors.html
     */
    cors: {
      /**
       * @default true
       */
      enabled?: boolean
      origin?: string
      credentials?: boolean
    }
    /**
     * Represents the complete base URL exposed externally by your bot. This is useful if you configure the bot
     * locally and use NGINX as a reverse proxy to handle HTTPS. It should include the protocol and no trailing slash.
     * If unset, it will be constructed from the real host/port
     * @example https://botpress.com
     * @default
     */
    externalUrl: string
    session: {
      /**
       * @default false
       */
      enabled: boolean
      /**
       * Time from Date.now() for expiry
       * Defaults to one hour
       * @default 1h
       */
      maxAge: string
    }
    /**
     * Configure the priority for establishing socket connections for webchat and studio users.
     * If the first method is not supported, it will fallback on the second.
     * If the first is supported but it fails with an error, it will not fallback.
     * @default ["websocket","polling"]
     */
    socketTransports: string[]
    rateLimit: {
      /**
       * * Security option to rate limit potential attacker trying to brute force something
       * @default false
       */
      enabled: boolean
      /**
       * Time window to compute rate limiting
       * @default 30s
       */
      limitWindow: string
      /**
       * * Maximum number of request in limit window to ban an IP. Keep in mind that this includes admin, studio and chat request so don't put it too low
       * @default 600
       */
      limit: number
    }
    /**
     * Adds default headers to the server's responses
     * @default {"X-Powered-By":"Botpress"}
     */
    headers: { [name: string]: string }
  }
  converse: ConverseConfig
  dialog: DialogConfig
  logs: LogsConfig

  pro: {
    monitoring: MonitoringConfig
    /**
     * The alert service is an extension of the monitoring service. The monitoring collects data, while the alert service
     * analyzes them and opens an incident when configured threshold are met.
     */
    alerting: AlertingConfig
  }
  /**
   * When this feature is enabled, fields saved as user attributes will be automatically erased when they expires. The timer is reset each time the value is modified
   * Setting a policy called "email": "30d" means that once an email is set, it will be removed in 30 days, unless it is changed in that timespan
   */
  dataRetention?: DataRetentionConfig

  eventCollector: EventCollectorConfig
  botMonitoring: BotMonitoringConfig

  /**
   * When true, the bot will avoid repeating itself. By default it is disabled.
   * Use in conjunction with BP_DECISION_MIN_NO_REPEAT to set the time before the bot will repeat itself
   * @default false
   */
  noRepeatPolicy: boolean
}

export interface DataRetentionConfig {
  /**
   * The janitor will check for expired fields at the set interval (second, minute, hour, day)
   * @default 10m
   */
  janitorInterval: string
  policies: RetentionPolicy
}

/**
 * @example "profile.email": "30d"
 * @default {}
 */
export interface RetentionPolicy {
  [key: string]: string
}

export interface MonitoringConfig {
  /**
   * To enable server monitoring, you need to enable the Pro version and configure your Redis server.
   * @default false
   */
  enabled: boolean
  /**
   * The interval between data collection of metrics and usage. The lower the value brings more details,
   * but comes at the cost of more storage required & processing time when viewing data.
   * @default 10s
   */
  collectionInterval: string
  /**
   * Data older than this will be cleared periodically.
   * @default 10d
   */
  retentionPeriod: string
  /**
   * The delay between execution of the janitor which removes statistics outside of the previously defined period
   * @default 15m
   */
  janitorInterval: string
}

export interface AlertingConfig {
  /**
   * To enable the alerting service, you need to enable the monitoring first.
   * @default false
   */
  enabled: boolean
  /**
   * Interval between each executions of the rule checker
   * @default 10s
   */
  watcherInterval: string
  /**
   * The duration for which resolved incidents will be kept
   * @default 10d
   */
  retentionPeriod: string
  /**
   * Delay between the execution of the janitor which removes resolved incidents.
   * @default 15m
   */
  janitorInterval: string
  /**
   * The list of rules which triggers an incident. When triggered, the OnIncidentChangedStatus hook
   * is called with the incident.
   * @default []
   */
  // rules: IncidentRule[]
}

export interface BotMonitoringConfig {
  /**
   * This must be enabled for the hook OnBotError to work properly.
   * @default true
   */
  enabled: boolean
  /**
   * The interval between which logs are accumulated before triggering the OnBotError hook.
   * Set this value higher if the hook is triggered too often.
   * @default 1m
   */
  interval: string
}

export interface EventCollectorConfig {
  /**
   * When enabled, incoming and outgoing events will be saved on the database.
   * It is required for some modules to work properly (eg: history, testing, developer tools on channel web)
   * @default true
   */
  enabled: boolean
  /**
   * Events are batched then sent to the database. Change the delay to save them more frequently or not.
   * @default 1s
   */
  collectionInterval: string
  /**
   * The duration for which events will be kept in the database
   * @default 30d
   */
  retentionPeriod: string
  /**
   * Specify an array of event types that won't be persisted to the database. For example, typing events and visits
   * may not provide you with useful information
   * @default ["visit","typing"]
   */
  ignoredEventTypes: string[]
  /**
   * Specify an array of properties that will be stripped from the event before being saved. For example, the "state" property of the event
   * contains a lot of details about the user session (context, attributes, etc) and may not be useful in some cases.
   * @default []
   */
  ignoredEventProperties: string[]
  /**
   * These properties are only stored with the event when the user is logged on the studio
   * @default ["ndu.triggers","ndu.predictions","nlu.predictions","state","processing","activeProcessing"]
   */
  debuggerProperties: string[]
}
