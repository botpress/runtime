const package = require('./build/gulp.package')
const gulp = require('gulp')
const rimraf = require('rimraf')

const yn = require('yn')
const _ = require('lodash')

process.on('uncaughtException', err => {
  console.error('An error occurred in your gulpfile: ', err)
  process.exit(1)
})

gulp.task('archive', gulp.series([package.packageAll]))

gulp.task('clean:node', cb => rimraf('**/node_modules/**', cb))
gulp.task('clean:out', cb => rimraf('packages/bp/dist', cb))
gulp.task('clean:data', cb => rimraf('packages/bp/dist/data', cb))
gulp.task('clean:db', cb => rimraf('packages/bp/dist/data/storage/core.sqlite', cb))
