// Copyright 2022 Touca, Inc. Subject to Apache-2.0 License.

import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import hidePoweredBy from 'hide-powered-by'
import moduleAlias from 'module-alias'

moduleAlias.addAliases({
  '@/controllers': `${__dirname}/controllers`,
  '@/middlewares': `${__dirname}/middlewares`,
  '@/models': `${__dirname}/models`,
  '@/queues': `${__dirname}/queues`,
  '@/routes': `${__dirname}/routes`,
  '@/schemas': `${__dirname}/schemas`,
  '@/types': `${__dirname}/types`,
  '@/utils': `${__dirname}/utils`
})

import { MetaModel } from '@/schemas/meta'
import { config } from '@/utils/config'
import logger from '@/utils/logger'
import { makeConnectionMongo, shutdownMongo } from '@/utils/mongo'
import { redisClient } from '@/utils/redis'
import { connectToServer } from '@/utils/routing'
import { objectStore } from '@/utils/store'

import { comparisonQueue, eventsQueue, messageQueue } from './queues'
import router from './routes'
import {
  analyticsService,
  autosealService,
  reportingService,
  retentionService,
  telemetryService
} from './services'
import {
  loadComparisonQueue,
  loadMessageQueue,
  setupSuperuser,
  statusReport,
  upgradeDatabase
} from './startup'

const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser(config.auth.cookieSecret))
app.use(hidePoweredBy())
app.use(compression())

if (config.isCloudHosted) {
  app.enable('trust proxy')
  app.use('/', router)
} else {
  app.use('/api', router)
  app.use(
    express.static(config.webapp.distDirectory, {
      maxAge: '1d',
      setHeaders: (res, path) => {
        if (express.static.mime.lookup(path) === 'text/html') {
          res.setHeader('Cache-Control', 'public, max-age=0')
        }
      }
    })
  )
  app.get('*', (_req, res) => {
    res.sendFile(`${config.webapp.distDirectory}/index.html`)
  })
}

app.use((err, req, res, next) => {
  const level = (err.status || 500) === 500 ? 'error' : 'warn'
  logger.log(level, '%j', err)
  res.status(err.status || 500).json({ errors: err.errors })
})

let server
async function launch(application) {
  const makeConnectionStore = () => objectStore.makeConnection()
  for (const { service, name } of [
    { service: makeConnectionStore, name: 'object store' },
    { service: makeConnectionMongo, name: 'database' },
    { service: () => redisClient.isReady(), name: 'cache server' }
  ]) {
    if (!(await connectToServer(service, name))) {
      process.exit(1)
    }
  }

  if ((await MetaModel.countDocuments()) === 0) {
    await MetaModel.create({})
    logger.info('created meta document with default values')
  }

  comparisonQueue.start()
  eventsQueue.start()
  messageQueue.start()

  if (!(await upgradeDatabase())) {
    logger.warn('failed to perform database migration')
  }

  await loadMessageQueue()
  await loadComparisonQueue()
  await setupSuperuser()

  await statusReport()

  // setup analytics service that performs background data processing
  // and populates batches and elements with information to be provided
  // to the user.
  setInterval(analyticsService, config.services.analytics.checkInterval * 1000)

  // setup auto-sealing service that periodically identifies recently
  // submitted batches and seals them to prevent future submission of
  // results to them.
  setInterval(autosealService, config.services.autoseal.checkInterval * 1000)

  // setup data retention policy enforcement service that periodically
  // identifies and prunes messages to free up disk space in databases
  // and local filesystem.
  setInterval(retentionService, config.services.retention.checkInterval * 1000)

  // setup batch comparison reporting service that periodically
  // identifies new batch comparison results and reports them
  // to subscribed users.
  setInterval(reportingService, config.services.reporting.checkInterval * 1000)

  // setup service to collect privacy-friendly aggregate usage data
  setInterval(telemetryService, config.services.telemetry.checkInterval * 1000)

  server = application.listen(config.express.port, () => {
    logger.info('listening on port %d', server.address().port)
  })
}

async function shutdown() {
  logger.debug('shutdown process started')
  await comparisonQueue.close()
  await eventsQueue.close()
  await messageQueue.close()
  await redisClient.shutdown()
  await shutdownMongo()
  server.close()
  logger.info('shutdown process completed')
}

;['SIGUSR2', 'SIGINT'].forEach((sig) => {
  process.once(sig, async () => {
    logger.warn('received signal %s', sig)
    shutdown()
      .catch((err) => {
        logger.warn('backend failed to shutdown gracefully: %O', err)
      })
      .finally(() => process.exit(1))
  })
})

launch(app)
