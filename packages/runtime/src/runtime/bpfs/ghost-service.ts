import { DirectoryListingOptions, ListenHandle, Logger } from 'botpress/runtime-sdk'
import { ObjectCache } from 'common/object-cache'
import { EventEmitter2 } from 'eventemitter2'
import { inject, injectable, tagged } from 'inversify'
import jsonlintMod from 'jsonlint-mod'
import _ from 'lodash'
import minimatch from 'minimatch'
import path from 'path'
import { TYPES } from 'runtime/app/types'
import { forceForwardSlashes, sanitize } from 'runtime/misc/utils'

import { VError } from 'verror'

import { PendingRevisions, StorageDriver } from '.'
import { DBStorageDriver } from './drivers/db-driver'
import { DiskStorageDriver } from './drivers/disk-driver'

export interface BpfsScopedChange {
  // An undefined bot ID = global
  botId: string | undefined
  // The list of local files which will overwrite their remote counterpart
  localFiles: string[]
  // List of added/deleted files based on local and remote files, and differences between files from revisions
  changes: FileChange[]
}

export interface FileChange {
  path: string
  action: FileChangeAction
  add?: number
  del?: number
  sizeDiff?: number
}

export type FileChangeAction = 'add' | 'edit' | 'del'

interface ScopedGhostOptions {
  botId?: string
  // Archive upload requires the full path, including drive letter, so it should not be sanitized
  noSanitize?: boolean
}

const GLOBAL_GHOST_KEY = '__global__'
const BOTS_GHOST_KEY = '__bots__'

@injectable()
export class GhostService {
  private _scopedGhosts: Map<string, ScopedGhostService> = new Map()
  public useDbDriver: boolean = false

  constructor(
    @inject(TYPES.DiskStorageDriver) private diskDriver: DiskStorageDriver,
    @inject(TYPES.DBStorageDriver) private dbDriver: DBStorageDriver,
    @inject(TYPES.ObjectCache) private cache: ObjectCache,
    @inject(TYPES.Logger)
    @tagged('name', 'GhostService')
    private logger: Logger
  ) {
    this.cache.events.on && this.cache.events.on('syncDbFilesToDisk', this._onSyncReceived)
  }

  async initialize(useDbDriver: boolean, ignoreSync?: boolean) {
    this.useDbDriver = useDbDriver
    this._scopedGhosts.clear()
  }

  // Not caching this scope since it's rarely used
  root(useDbDriver?: boolean): ScopedGhostService {
    return new ScopedGhostService('./data', this.diskDriver, this.dbDriver, useDbDriver ?? this.useDbDriver, this.cache)
  }

  global(): ScopedGhostService {
    if (this._scopedGhosts.has(GLOBAL_GHOST_KEY)) {
      return this._scopedGhosts.get(GLOBAL_GHOST_KEY)!
    }

    const scopedGhost = new ScopedGhostService(
      './data/global',
      this.diskDriver,
      this.dbDriver,
      this.useDbDriver,
      this.cache
    )

    this._scopedGhosts.set(GLOBAL_GHOST_KEY, scopedGhost)
    return scopedGhost
  }

  custom(baseDir: string) {
    return new ScopedGhostService(baseDir, this.diskDriver, this.dbDriver, false, this.cache, { noSanitize: true })
  }

  bots(): ScopedGhostService {
    if (this._scopedGhosts.has(BOTS_GHOST_KEY)) {
      return this._scopedGhosts.get(BOTS_GHOST_KEY)!
    }

    const scopedGhost = new ScopedGhostService(
      './data/bots',
      this.diskDriver,
      this.dbDriver,
      this.useDbDriver,
      this.cache
    )

    this._scopedGhosts.set(BOTS_GHOST_KEY, scopedGhost)
    return scopedGhost
  }

  forBot(botId: string): ScopedGhostService {
    if (this._scopedGhosts.has(botId)) {
      return this._scopedGhosts.get(botId)!
    }

    const scopedGhost = new ScopedGhostService(
      `./data/bots/${botId}`,
      this.diskDriver,
      this.dbDriver,
      this.useDbDriver,
      this.cache,
      { botId }
    )

    const listenForUnmount = args => {
      if (args && args.botId === botId) {
        scopedGhost.events.removeAllListeners()
      } else {
        process.BOTPRESS_EVENTS.once('after_bot_unmount', listenForUnmount)
      }
    }
    listenForUnmount({})

    this._scopedGhosts.set(botId, scopedGhost)
    return scopedGhost
  }

  private _onSyncReceived = async (message: string) => {
    try {
      const { rootFolder, botId } = JSON.parse(message)
      if (botId) {
        await this.forBot(botId).syncDatabaseFilesToDisk(rootFolder)
      } else {
        await this.global().syncDatabaseFilesToDisk(rootFolder)
      }
    } catch (err) {
      this.logger.attachError(err).error('Could not sync files locally.')
    }
  }
}

export interface FileContent {
  name: string
  content: string | Buffer
}

export class ScopedGhostService {
  isDirectoryGlob: boolean
  primaryDriver: StorageDriver
  events: EventEmitter2 = new EventEmitter2()

  constructor(
    private baseDir: string,
    private diskDriver: DiskStorageDriver,
    private dbDriver: DBStorageDriver,
    private useDbDriver: boolean,
    private cache: ObjectCache,
    private options: ScopedGhostOptions = {
      botId: undefined,
      noSanitize: true
    }
  ) {
    if (![-1, this.baseDir.length - 1].includes(this.baseDir.indexOf('*'))) {
      throw new Error("Base directory can only contain '*' at the end of the path")
    }

    this.isDirectoryGlob = this.baseDir.endsWith('*')
    this.primaryDriver = useDbDriver ? dbDriver : diskDriver
  }

  private _normalizeFolderName(rootFolder: string) {
    const folder = forceForwardSlashes(path.join(this.baseDir, rootFolder))
    return this.options.noSanitize ? folder : sanitize(folder, 'folder')
  }

  private _normalizeFileName(rootFolder: string, file: string) {
    const fullPath = path.join(rootFolder, file)
    const folder = this._normalizeFolderName(path.dirname(fullPath))
    return forceForwardSlashes(path.join(folder, sanitize(path.basename(fullPath))))
  }

  objectCacheKey = str => `object::${str}`
  bufferCacheKey = str => `buffer::${str}`

  private async _invalidateFile(fileName: string) {
    await this.cache.invalidate(this.objectCacheKey(fileName))
    await this.cache.invalidate(this.bufferCacheKey(fileName))
  }

  async invalidateFile(rootFolder: string, fileName: string): Promise<void> {
    const filePath = this._normalizeFileName(rootFolder, fileName)
    await this._invalidateFile(filePath)
  }

  public async clearCache() {
    await this.cache.invalidateStartingWith(this._normalizeFolderName(''))
  }

  async readFileAsBuffer(rootFolder: string, file: string): Promise<Buffer> {
    if (this.isDirectoryGlob) {
      throw new Error("Ghost can't read or write under this scope")
    }

    const fileName = this._normalizeFileName(rootFolder, file)
    const cacheKey = this.bufferCacheKey(fileName)

    if (!(await this.cache.has(cacheKey))) {
      const value = await this.primaryDriver.readFile(fileName)
      await this.cache.set(cacheKey, value)
      return value
    }

    return this.cache.get<Buffer>(cacheKey)
  }

  async readFileAsString(rootFolder: string, file: string): Promise<string> {
    return (await this.readFileAsBuffer(rootFolder, file)).toString()
  }

  async readFileAsObject<T>(rootFolder: string, file: string): Promise<T> {
    const fileName = this._normalizeFileName(rootFolder, file)
    const cacheKey = this.objectCacheKey(fileName)

    if (!(await this.cache.has(cacheKey))) {
      const value = await this.readFileAsString(rootFolder, file)
      let obj
      try {
        obj = <T>JSON.parse(value)
      } catch (e) {
        try {
          jsonlintMod.parse(value)
        } catch (e) {
          throw new Error(`SyntaxError in your JSON: ${file}: \n ${e}`)
        }
      }
      await this.cache.set(cacheKey, obj)
      return obj
    }

    return this.cache.get<T>(cacheKey)
  }

  async fileExists(rootFolder: string, file: string): Promise<boolean> {
    const fileName = this._normalizeFileName(rootFolder, file)
    const cacheKey = this.objectCacheKey(fileName)

    try {
      if (await this.cache.has(cacheKey)) {
        return true
      }

      return this.primaryDriver.fileExists(fileName)
    } catch (err) {
      return false
    }
  }

  async syncDatabaseFilesToDisk(rootFolder: string): Promise<void> {
    if (!this.useDbDriver) {
      return
    }

    const remoteFiles = await this.dbDriver.directoryListing(this._normalizeFolderName(rootFolder))
    const filePath = filename => this._normalizeFileName(rootFolder, filename)

    await Promise.mapSeries(remoteFiles, async file =>
      this.diskDriver.upsertFile(filePath(file), await this.dbDriver.readFile(filePath(file)))
    )
  }

  async directoryListing(
    rootFolder: string,
    fileEndingPattern: string = '*.*',
    excludes?: string | string[],
    includeDotFiles?: boolean,
    options: DirectoryListingOptions = {}
  ): Promise<string[]> {
    try {
      const files = await this.primaryDriver.directoryListing(this._normalizeFolderName(rootFolder), {
        excludes,
        includeDotFiles,
        ...options
      })

      return (files || []).filter(
        minimatch.filter(fileEndingPattern, { matchBase: true, nocase: true, noglobstar: false, dot: includeDotFiles })
      )
    } catch (err) {
      if (err && err.message && err.message.includes('ENOENT')) {
        return []
      }
      throw new VError(err, `Could not list directory under ${rootFolder}`)
    }
  }

  async getPendingChanges(): Promise<PendingRevisions> {
    if (!this.useDbDriver) {
      return {}
    }

    const revisions = await this.dbDriver.listRevisions(this.baseDir)
    const result: PendingRevisions = {}

    for (const revision of revisions) {
      const rPath = path.relative(this.baseDir, revision.path)
      const folder = rPath.includes(path.sep) ? rPath.substr(0, rPath.indexOf(path.sep)) : 'root'

      if (!result[folder]) {
        result[folder] = []
      }

      result[folder].push(revision)
    }

    return result
  }

  onFileChanged(callback: (filePath: string) => void): ListenHandle {
    const cb = file => callback && callback(file)
    this.events.on('changed', cb)
    return { remove: () => this.events.off('changed', cb) }
  }
}
