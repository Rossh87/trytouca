// Copyright 2022 Touca, Inc. Subject to Apache-2.0 License.

import type { EPlatformRole } from '@touca/api-schema'
import * as bcrypt from 'bcryptjs'
import { once } from 'lodash'

import { addSampleData } from '@/models/sampleData'
import { generateTeamSlug, teamCreate } from '@/models/team'
import { SessionModel } from '@/schemas/session'
import { IUserDocument, UserModel } from '@/schemas/user'
import { config } from '@/utils/config'
import * as jwt from '@/utils/jwt'
import logger from '@/utils/logger'
import * as mailer from '@/utils/mailer'
import { analytics, EActivity, TrackerInfo } from '@/utils/tracker'

/**
 * Find a username that is not already registered.
 */
async function makeUsername(): Promise<string> {
  const random = () => Math.floor(100000 + Math.random() * 900000)
  let slug = `user${random()}`
  while (await UserModel.countDocuments({ username: slug })) {
    logger.warn('makeUsername() implementation may be inefficient')
    slug = `user${random()}`
  }
  return slug
}

async function getPlatformOwner(): Promise<EPlatformRole> {
  const platformRole: EPlatformRole = 'owner'
  const hasOwner = await UserModel.countDocuments({ platformRole })
  if (!hasOwner) {
    logger.debug('user will be owner of the platform')
    return 'owner'
  }
  return 'user'
}

/**
 * Create a new user account or re-uses an existing one.
 */
export async function createUserAccount(
  payload: Partial<TrackerInfo>
): Promise<IUserDocument> {
  const hasName = !!payload.name
  const makePass = (length: number) =>
    [...Array(length)].map(() => Math.random().toString(36)[2]).join('')

  // acquire a random username

  const username = await makeUsername()

  // generate password hash
  // we perform this operation after checking if user is registered
  // to avoid paying the cost of hash generation in case they are

  const password = await bcrypt.hash(makePass(16), config.auth.bcryptSaltRound)

  // generate activation key
  // we send this key in the welcome email to the user so we can verify
  // their email address.

  const activationKey = makePass(config.auth.activationKeyLength)

  // the first user who creates an account should be the platform owner.
  // we make this check once per lifetime of this node process.

  const platformRole = await once(getPlatformOwner)()

  // register user in database

  const newUser = await UserModel.create({
    activationKey: hasName ? undefined : activationKey,
    activatedAt: hasName ? new Date() : undefined,
    createdAt: new Date(),
    email: payload.email,
    fullname: payload.name,
    password,
    platformRole,
    username
  })
  logger.info('%s: created account', payload.email)

  // notify user that their user account is created
  // we are intentionally not awaiting on this operation

  const mailData = hasName
    ? {
        firstName: `, ${payload.name}`,
        hasVerificationLink: false,
        previewMessage: "We're excited to have you!",
        verificationLink: ''
      }
    : {
        firstName: '',
        hasVerificationLink: true,
        previewMessage: 'Here is your email verification link.',
        verificationLink: `${config.webapp.root}/account/activate?key=${activationKey}`
      }
  mailer.mailUser(newUser, 'Welcome to Touca 👋🏼', 'auth-signup-user', mailData)

  // notify platform admins that a new user account was verified.

  mailer.mailAdmins({
    title: 'New Account Created',
    body: `New account created for <b>${username}</b> (<a href="mailto:${payload.email}">${payload.email}</a>).`
  })

  // if configured to do so, create a "tutorial" suite and populate it with
  // sample test results.

  if (config.samples.enabled) {
    addSampleData(
      await teamCreate(newUser, {
        slug: await generateTeamSlug(),
        name: 'Tutorial'
      })
    )
  } else {
    logger.debug(
      '%s: skipped submission of sample data. feature is disabled.',
      newUser.username
    )
  }

  // add event to tracking system

  analytics
    .add_member(newUser, {
      avatar: payload.avatar,
      created_at: newUser.createdAt,
      email: payload.email,
      ip_address: payload.ip_address,
      name: payload.name,
      first_name: payload.first_name,
      last_name: payload.last_name,
      user_id: payload.user_id,
      username: payload.username
    })
    .then(() => analytics.add_activity(EActivity.AccountCreated, newUser))

  return newUser
}

/**
 * Create a new user session or re-uses an existing one.
 */
export async function createUserSession(
  user: IUserDocument,
  options: { askedAgent: string; askedIpAddress: string }
): Promise<{ token: string; expiresAt: Date }> {
  // edge case:
  // if user has an active unexpired session with matching metadata
  // provide the same token that we had provided before.

  const prevSession = await SessionModel.findOne({
    agent: options.askedAgent,
    expiresAt: { $gt: new Date() },
    ipAddr: options.askedIpAddress,
    userId: user._id
  })

  if (prevSession) {
    logger.debug('%s: reusing previously issued token', user.username)
    return { token: jwt.issue(prevSession), expiresAt: prevSession.expiresAt }
  }

  // in the more likely case, when the user had no prior active session
  // with matching metadata, issue a new auth token.

  logger.debug('%s: issuing auth token for user', user.username)

  await UserModel.findByIdAndUpdate(user._id, {
    $unset: { lockedAt: true, loginAttempts: true }
  })

  // set expiration date of the token

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + config.auth.jwtLifetime)

  // add user session to database.

  const session = await SessionModel.create({
    agent: options.askedAgent,
    expiresAt,
    ipAddr: options.askedIpAddress,
    userId: user._id
  })

  // generate a JSON web token

  const token = jwt.issue(session)
  logger.info('%s: issued auth token', user.username)

  return { token, expiresAt }
}
