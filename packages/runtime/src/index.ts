import { RuntimeConfig } from './runtime/config/runtime.config'

export interface RuntimeSetup {
  config: RuntimeConfig
  dataFolder: string
  bots: string[]
  // Register additional middlewares
  middlewares: { outgoing: any; incoming: any }
  // API provided here will augment the base api of the runtime
  api: {
    hooks: any
    actions: any
  }
  // Optional emitter to send logs to a user
  logStreamEmitter: any
  messagingEndpoint?: any
}

let runtime

export const getRuntime = async (config?: RuntimeSetup): Promise<any> => {
  if (runtime) {
    return runtime
  } else if (!config) {
    return console.error('Runtime is not initialized')
  }

  const { start } = require('./runtime/app/bootstrap')

  runtime = await start(config)
  return runtime
}

if (!process.distro) {
  require('./standalone')
}
