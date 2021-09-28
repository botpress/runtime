import { BotConfig, Logger } from 'botpress/sdk'
import { ObjectCache } from 'common/object-cache'
import { FatalError } from 'errors'
import { Runtime } from 'inspector'
import { inject, injectable } from 'inversify'
import _, { PartialDeep } from 'lodash'
import { GhostService } from 'runtime/bpfs'

import { RuntimeConfig } from 'runtime/config'
import { calculateHash, stringify } from 'runtime/misc/utils'
import { TYPES } from 'runtime/types'

/**
 * These properties should not be considered when calculating the config hash
 * They are always read from the configuration file and can be dynamically changed
 */
const removeDynamicProps = config => _.omit(config, ['superAdmins'])

@injectable()
export class ConfigProvider {
  public onBotpressConfigChanged: ((initialHash: string, newHash: string) => Promise<void>) | undefined

  private _botpressConfigCache: RuntimeConfig | undefined
  public initialConfigHash: string | undefined
  public currentConfigHash!: string
  private _deprecateEnvVarWarned = false

  constructor(
    @inject(TYPES.GhostService) private ghostService: GhostService,
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ObjectCache) private cache: ObjectCache
  ) {
    // this.cache.events.on('invalidation', async key => {
    //   if (key === 'object::data/global/botpress.config.json' || key === 'file::data/global/botpress.config.json') {
    //     this._botpressConfigCache = undefined
    //     const config = await this.getRuntimeConfig()
    //     this.currentConfigHash = calculateHash(JSON.stringify(removeDynamicProps(config)))
    //     this.onBotpressConfigChanged && this.onBotpressConfigChanged(this.initialConfigHash!, this.currentConfigHash)
    //   }
    // })
  }

  setRuntimeConfig(config: RuntimeConfig) {
    this._botpressConfigCache = config
  }

  async getRuntimeConfig(): Promise<RuntimeConfig> {
    if (this._botpressConfigCache) {
      return this._botpressConfigCache
    }

    const config = await this.getConfig<RuntimeConfig>('botpress.config.json')
    this._botpressConfigCache = config

    return config
  }

  async getBotConfig(botId: string): Promise<BotConfig> {
    return this.getConfig<BotConfig>('bot.config.json', botId)
  }

  private async getConfig<T>(fileName: string, botId?: string): Promise<T> {
    try {
      let content: string

      if (botId) {
        content = await this.ghostService
          .forBot(botId)
          .readFileAsString('/', fileName)
          .catch(_err => this.ghostService.forBot(botId).readFileAsString('/', fileName))
      } else {
        content = await this.ghostService
          .global()
          .readFileAsString('/', fileName)
          .catch(_err => this.ghostService.global().readFileAsString('/', fileName))
      }

      if (!content) {
        throw new FatalError(`Modules configuration file "${fileName}" not found`)
      }

      // Variables substitution
      // TODO Check of a better way to handle path correction
      content = content.replace('%BOTPRESS_DIR%', process.PROJECT_LOCATION.replace(/\\/g, '/'))
      content = content.replace('"$isProduction"', process.IS_PRODUCTION ? 'true' : 'false')
      content = content.replace('"$isDevelopment"', process.IS_PRODUCTION ? 'false' : 'true')

      return <T>JSON.parse(content)
    } catch (e) {
      throw new FatalError(e, `Error reading configuration file "${fileName}"`)
    }
  }
}
