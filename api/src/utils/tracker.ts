// Copyright 2022 Touca, Inc. Subject to Apache-2.0 License.

import SegmentClient from 'analytics-node'

import { relay } from '@/models/relay'
import { IUser } from '@/schemas/user'
import { config } from '@/utils/config'

export enum EActivity {
  AccountActivated = 'account:activated',
  AccountActivationResent = 'account:activation_link_resent',
  AccountCreated = 'account:created',
  AccountDeleted = 'account:deleted',
  AccountLoggedIn = 'account:logged_in',
  AccountLoggedOut = 'account:logged_out',
  AccountPasswordRemind = 'account:password_remind',
  AccountPasswordResent = 'account:password_resent',
  AccountPasswordReset = 'account:password_reset',
  BatchDeleted = 'batch:deleted',
  BatchPDFExported = 'batch:pdf_exported',
  BatchPromoted = 'batch:promoted',
  BatchZipExported = 'batch:zip_exported',
  BatchSealed = 'batch:sealed',
  CommentCreated = 'comment:created',
  CommentDeleted = 'comment:deleted',
  CommentEdited = 'comment:edited',
  CommentReplied = 'comment:replied',
  FeatureFlagUpdated = 'feature_flag:updated',
  ProfileUpdated = 'profile:updated',
  SelfHostedInstall = 'self_host:installed',
  SelfHostedUsage = 'self_host:usage_reported',
  SuiteCreated = 'suite:created',
  SuiteDeleted = 'suite:deleted',
  SuiteSubscribed = 'suite:subscribed',
  TeamCreated = 'team:created',
  TeamDeleted = 'team:deleted',
  TeamMemberAccepted = 'team_member:accepted',
  TeamMemberAdded = 'team_member:added',
  TeamMemberApproved = 'team_member:approved',
  TeamMemberDeclined = 'team_member:declined',
  TeamMemberLeft = 'team_member:left',
  TeamMemberReceived = 'team_member:received',
  TeamMemberRejected = 'team_member:rejected',
  TeamMemberRemoved = 'team_member:removed',
  TeamMemberRescinded = 'team_member:rescinded',
  TeamMemberRequested = 'team_member:requested',
  TeamMemberPromoted = 'team_member:promoted',
  TeamMemberInvited = 'team_member:sent',
  TeamMemberWithdrawn = 'team_member:withdrawn'
}

export type TrackerInfo = {
  avatar: string
  created_at: Date
  email: string
  ip_address: string
  name: string
  first_name: string
  last_name: string
  user_id: string
  username: string
}

class OrbitTracker {
  async add_member(user: IUser, data: Partial<TrackerInfo>) {
    await relay({
      host: 'https://app.orbit.love',
      path: '/api/v1/touca/members',
      authorization: `Bearer ${config.tracking.orbit_key}`,
      data: JSON.stringify({
        member: {
          email: data.email,
          name: data.name,
          slug: data.username
        },
        identity: {
          uid: user._id,
          email: data.email,
          name: data.name,
          username: data.username,
          source: 'touca',
          source_host: config.express.root
        }
      })
    })
  }

  async add_activity(type: EActivity, user: IUser, data: Partial<TrackerInfo>) {
    const allowlist = [
      EActivity.AccountCreated,
      EActivity.BatchPromoted,
      EActivity.BatchSealed,
      EActivity.SelfHostedInstall,
      EActivity.SuiteCreated,
      EActivity.ProfileUpdated,
      EActivity.TeamCreated
    ]
    if (!allowlist.includes(type)) {
      return
    }
    await relay({
      host: 'https://app.orbit.love',
      path: '/api/v1/touca/activities',
      authorization: `Bearer ${config.tracking.orbit_key}`,
      data: JSON.stringify({
        activity: {
          activity_type_key: type,
          occurred_at: new Date().toISOString(),
          properties: data,
          title: type
        },
        identity: {
          uid: user._id,
          source: 'touca',
          source_host: config.express.root
        }
      })
    })
  }
}

class SegmentTracker {
  private segment: SegmentClient
  constructor() {
    if (config.tracking.segment_key) {
      this.segment = new SegmentClient(config.tracking.segment_key)
    }
  }
  async add_member(user: IUser, data: Partial<TrackerInfo>) {
    this.segment?.identify({
      userId: user._id.toString(),
      traits: {
        avatar: data.avatar,
        createdAt: data.created_at?.toISOString(),
        email: data.email,
        firstName: data.first_name,
        id: data.user_id?.toString(),
        lastName: data.last_name,
        name: data.name,
        username: data.username
      }
    })
  }
  async add_activity(type: EActivity, user: IUser, data: Partial<TrackerInfo>) {
    this.segment?.track({
      userId: user._id.toString(),
      event: type,
      properties: data
    })
  }
}

class Analytics {
  private orbit_tracker = new OrbitTracker()
  private segment_tracker = new SegmentTracker()

  constructor() {
    if (config.tracking.orbit_key) {
      this.orbit_tracker = new OrbitTracker()
    }
    if (config.tracking.segment_key) {
      this.segment_tracker = new SegmentTracker()
    }
  }

  async add_member(user: IUser, data: Partial<TrackerInfo>): Promise<void> {
    await Promise.allSettled([
      this.orbit_tracker?.add_member(user, data),
      this.segment_tracker?.add_member(user, data)
    ])
  }

  async add_activity(
    type: EActivity,
    user: IUser,
    data?: Record<string, unknown>
  ) {
    await Promise.allSettled([
      this.orbit_tracker?.add_activity(type, user, data),
      this.segment_tracker?.add_activity(type, user, data)
    ])
  }
}

export const analytics = new Analytics()
