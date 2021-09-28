import * as sdk from 'botpress/runtime-sdk'
import { WrapErrorsWith } from 'errors'
import { RuntimeSetup } from 'index'
import { inject, injectable, tagged } from 'inversify'
import _ from 'lodash'
import moment from 'moment'
import ms from 'ms'
import path from 'path'
import { BotService, BotMonitoringService } from 'runtime/bots'
import { GhostService } from 'runtime/bpfs'
import { CMSService } from 'runtime/cms'
import { RuntimeConfig, ConfigProvider } from 'runtime/config'

import { buildUserKey, converseApiEvents, ConverseService } from 'runtime/converse'
import Database from 'runtime/database'
import { StateManager, DecisionEngine, DialogEngine, DialogJanitor, WellKnownFlags, FlowService } from 'runtime/dialog'
import { SessionIdFactory } from 'runtime/dialog/sessions'
import { addStepToEvent, EventCollector, StepScopes, StepStatus, EventEngine, Event, IOEvent } from 'runtime/events'
import { AppLifecycle, AppLifecycleEvents } from 'runtime/lifecycle'
import {
  LoggerDbPersister,
  LoggerFilePersister,
  LoggerProvider,
  LogsJanitor,
  PersistedConsoleLogger
} from 'runtime/logger'
import { MessagingService } from 'runtime/messaging'
import { QnaService } from 'runtime/qna'
import { ActionService, Hooks, HookService } from 'runtime/user-code'
import { getDebugScopes, setDebugScopes } from '../../debug'
import { createForAction, createForGlobalHooks } from './api'
import { HTTPServer } from './server'

import { TYPES } from './types'

const DEBOUNCE_DELAY = ms('2s')

@injectable()
export class Botpress {
  config!: RuntimeConfig | undefined
  api!: typeof sdk

  constructor(
    @inject(TYPES.ConfigProvider) private configProvider: ConfigProvider,
    @inject(TYPES.Database) private database: Database,
    @inject(TYPES.Logger)
    @tagged('name', 'Server')
    private logger: sdk.Logger,
    @inject(TYPES.GhostService) private ghostService: GhostService,
    @inject(TYPES.HTTPServer) private httpServer: HTTPServer,
    @inject(TYPES.HookService) private hookService: HookService,
    @inject(TYPES.EventEngine) private eventEngine: EventEngine,
    @inject(TYPES.CMSService) private cmsService: CMSService,
    @inject(TYPES.ConverseService) private converseService: ConverseService,
    @inject(TYPES.DecisionEngine) private decisionEngine: DecisionEngine,
    @inject(TYPES.LoggerProvider) private loggerProvider: LoggerProvider,
    @inject(TYPES.DialogJanitorRunner) private dialogJanitor: DialogJanitor,
    @inject(TYPES.LogJanitorRunner) private logJanitor: LogsJanitor,
    @inject(TYPES.LoggerDbPersister) private loggerDbPersister: LoggerDbPersister,
    @inject(TYPES.LoggerFilePersister) private loggerFilePersister: LoggerFilePersister,
    @inject(TYPES.StateManager) private stateManager: StateManager,
    @inject(TYPES.BotService) private botService: BotService,
    @inject(TYPES.EventCollector) private eventCollector: EventCollector,
    @inject(TYPES.BotMonitoringService) private botMonitor: BotMonitoringService,
    @inject(TYPES.QnaService) private qnaService: QnaService,
    @inject(TYPES.FlowService) private flowService: FlowService,
    @inject(TYPES.ActionService) private actionService: ActionService,
    @inject(TYPES.MessagingService) private messagingService: MessagingService
  ) {}

  private _refreshBot = async (botId: string) => {
    await this.ghostService.forBot(botId).clearCache()

    await this.cmsService.refreshElements(botId)
    await this.flowService.forBot(botId).reloadFlows()

    await this.hookService.clearRequireCache()
    await this.actionService.forBot(botId).clearRequireCache()
  }

  private _refreshDebounced = _.debounce(this._refreshBot, DEBOUNCE_DELAY, { leading: true, trailing: false })

  async start(options: RuntimeSetup) {
    const beforeDt = moment()
    await this.initialize(options)
    const bootTime = moment().diff(beforeDt, 'milliseconds')
    this.logger.info(`Ready in ${bootTime}ms`)

    return {
      sendEvent: this.eventEngine.sendEvent.bind(this.eventEngine),
      sendConverseMessage: this.converseService.sendMessage.bind(this.converseService),
      mountBot: this.botService.mountBot.bind(this.botService),
      unmountBot: this.botService.unmountBot.bind(this.botService),
      refreshBot: this._refreshDebounced
    }
  }

  private async disableModules() {
    // If there is no CORE_PORT, then we must disable all modules (except builtins one)
    // if (!process.env.CORE_PORT) {
    //   const globalConfig = await app.config.getBotpressConfig()
    //   const modules = _.uniqBy(globalConfig.modules, x => x.location).map(x => x.location.replace('MODULES_ROOT/', ''))
    //   for (const mod of modules) {
    //     const mrl = new ModuleResourceLoader(logger, mod, app.ghost)
    //     await mrl.disableResources()
    //   }
    // }
  }

  private async initialize(options: RuntimeSetup) {
    if (!options) {
      this.config = await this.configProvider.getRuntimeConfig()
      const bots = await this.botService.getBotsIds()
      options = {
        bots
      } as any

      await this.startServer()
    } else {
      this.configProvider.setRuntimeConfig(options.config)
      this.config = options.config

      if (options.logStreamEmitter) {
        PersistedConsoleLogger.LogStreamEmitter = options.logStreamEmitter
      }
    }

    setDebugScopes(process.core_env.DEBUG || (process.IS_PRODUCTION ? '' : 'bp:dialog'))

    AppLifecycle.setDone(AppLifecycleEvents.CONFIGURATION_LOADED)

    this.api = await createForGlobalHooks(options.api?.hooks)
    await createForAction(options.api?.hooks)

    if (options.middlewares) {
      for (const mw of options.middlewares.incoming) {
        this.eventEngine.register(mw)
      }

      for (const mw of options.middlewares.outgoing) {
        this.eventEngine.register(mw)
      }
    }

    await this.restoreDebugScope()
    await this.initializeServices(options)

    await this.discoverBots(options.bots)

    AppLifecycle.setDone(AppLifecycleEvents.BOTPRESS_READY)
  }

  async restoreDebugScope() {
    if (await this.ghostService.global().fileExists('/', 'debug.json')) {
      try {
        const { scopes } = await this.ghostService.global().readFileAsObject('/', 'debug.json')
        setDebugScopes(scopes.join(','))
      } catch (err) {
        this.logger.attachError(err).error("Couldn't load debug scopes. Check the syntax of debug.json")
      }
    }
  }

  private async startServer() {
    await this.httpServer.start()
    AppLifecycle.setDone(AppLifecycleEvents.HTTP_SERVER_READY)
  }

  @WrapErrorsWith('Error while discovering bots')
  async discoverBots(botsToMount: string[]): Promise<void> {
    const maxConcurrentMount = parseInt(process.env.MAX_CONCURRENT_MOUNT || '5')
    await Promise.map(botsToMount, botId => this.botService.mountBot(botId), { concurrency: maxConcurrentMount })
  }

  private async initializeServices(options: RuntimeSetup) {
    await this.loggerDbPersister.initialize(this.database, await this.loggerProvider('LogDbPersister'))
    this.loggerDbPersister.start()

    await this.loggerFilePersister.initialize(this.config!, await this.loggerProvider('LogFilePersister'))

    await this.cmsService.initialize()
    await this.eventCollector.initialize(this.database)
    await this.qnaService.initialize()
    await this.messagingService.initialize(options.messagingEndpoint)

    this.eventEngine.onBeforeIncomingMiddleware = async (event: sdk.IO.IncomingEvent) => {
      await this.stateManager.restore(event)
      addStepToEvent(event, StepScopes.StateLoaded)
      await this.hookService.executeHook(new Hooks.BeforeIncomingMiddleware(this.api, event))
    }

    this.eventEngine.onAfterIncomingMiddleware = async (event: sdk.IO.IncomingEvent) => {
      if (event.isPause) {
        this.eventCollector.storeEvent(event)
        return
      }

      if (event.ndu && event.type === 'workflow_ended') {
        const hasWorkflowEndedTrigger = Object.keys(event.ndu.triggers).find(
          x => event.ndu?.triggers[x].result['workflow_ended'] === 1
        )

        if (!hasWorkflowEndedTrigger) {
          event.setFlag(WellKnownFlags.SKIP_DIALOG_ENGINE, true)
        }
      }

      await this.hookService.executeHook(new Hooks.AfterIncomingMiddleware(this.api, event))
      const sessionId = SessionIdFactory.createIdFromEvent(event)

      if (event.debugger) {
        addStepToEvent(event, StepScopes.Dialog, StepStatus.Started)
        this.eventCollector.storeEvent(event)
      }

      await this.decisionEngine.processEvent(sessionId, event)

      if (event.debugger) {
        addStepToEvent(event, StepScopes.EndProcessing)
        this.eventCollector.storeEvent(event)
      }

      await converseApiEvents.emitAsync(`done.${buildUserKey(event.botId, event.target)}`, event)
    }

    this.eventEngine.onBeforeOutgoingMiddleware = async (event: sdk.IO.OutgoingEvent) => {
      this.eventCollector.storeEvent(event)
      await this.hookService.executeHook(new Hooks.BeforeOutgoingMiddleware(this.api, event))
    }

    this.decisionEngine.onBeforeSuggestionsElection = async (
      sessionId: string,
      event: sdk.IO.IncomingEvent,
      suggestions: sdk.IO.Suggestion[]
    ) => {
      await this.hookService.executeHook(new Hooks.BeforeSuggestionsElection(this.api, sessionId, event, suggestions))
    }

    this.decisionEngine.onAfterEventProcessed = async (event: sdk.IO.IncomingEvent) => {
      if (!event.ndu) {
        this.eventCollector.storeEvent(event)
        return this.hookService.executeHook(new Hooks.AfterEventProcessed(this.api, event))
      }

      const { workflows } = event.state.session

      const activeWorkflow = Object.keys(workflows).find(x => workflows[x].status === 'active')
      const completedWorkflows = Object.keys(workflows).filter(x => workflows[x].status === 'completed')

      this.eventCollector.storeEvent(event, activeWorkflow ? workflows[activeWorkflow] : undefined)
      await this.hookService.executeHook(new Hooks.AfterEventProcessed(this.api, event))

      completedWorkflows.forEach(async workflow => {
        const wf = workflows[workflow]
        const metric = wf.success ? 'bp_core_workflow_completed' : 'bp_core_workflow_failed'
        BOTPRESS_CORE_EVENT(metric, { botId: event.botId, channel: event.channel, wfName: workflow })

        delete event.state.session.workflows[workflow]

        if (!activeWorkflow && !wf.parent) {
          await this.eventEngine.sendEvent(
            Event({
              ..._.pick(event, ['botId', 'channel', 'target', 'threadId']),
              direction: 'incoming',
              type: 'workflow_ended',
              payload: { ...wf, workflow }
            })
          )
        }
      })
    }

    this.botMonitor.onBotError = async (botId: string, events: sdk.LoggerEntry[]) => {
      await this.hookService.executeHook(new Hooks.OnBotError(this.api, botId, events))
    }

    await this.stateManager.initialize()
    await this.logJanitor.start()
    await this.dialogJanitor.start()
    this.eventCollector.start()
  }
}
