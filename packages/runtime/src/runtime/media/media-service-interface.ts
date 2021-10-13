// The idea here is to provide multiple backend implementation of this like ghost drivers
// type MediaBackend = 'ghost' | 'fs' | 'database' | 's3'
export interface MediaService {
  readFile: (fileName: string) => Promise<Buffer> // TODO Buffer | ReadStream
  getPublicURL: (fileName: string) => string
}
