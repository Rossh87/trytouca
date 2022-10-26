// Copyright 2022 Touca, Inc. Subject to Apache-2.0 License.

import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import type {
  BatchItem,
  BatchListResponse,
  ElementListResponse,
  ENotificationType,
  SuiteItem,
  SuiteLookupResponse,
  TeamLookupResponse
} from '@touca/api-schema';
import { isEqual } from 'lodash-es';
import {
  filter,
  forkJoin,
  Observable,
  of,
  pipe,
  Subject,
  take,
  takeUntil
} from 'rxjs';

import { FrontendBatchItem } from '@/core/models/frontendtypes';
import {
  AlertKind,
  AlertService,
  ApiService,
  UserService
} from '@/core/services';
import { PageTab } from '@/home/components';
import { IPageService } from '@/home/models/pages.model';
import { errorLogger } from '@/shared/utils/errorLogger';
import {
  ServerEvent,
  ServerEventService
} from '@/core/services/serverEvents.service';

import {
  SuitePageElement,
  SuitePageElementType,
  SuitePageItem,
  SuitePageItemType
} from './suite.model';

export enum SuitePageTabType {
  Versions = 'versions',
  Testcases = 'testcases',
  Settings = 'settings'
}

export enum SuiteBannerType {
  SuiteNotFound = 'not-found'
}

type FetchInput = {
  currentTab: string;
  teamSlug: string;
  suiteSlug: string;
};

const availableTabs: Record<SuitePageTabType, PageTab<SuitePageTabType>> = {
  [SuitePageTabType.Versions]: {
    type: SuitePageTabType.Versions,
    name: 'Versions',
    link: 'versions',
    icon: 'feather-list',
    shown: true
  },
  [SuitePageTabType.Testcases]: {
    type: SuitePageTabType.Testcases,
    name: 'Test Cases',
    link: 'testcases',
    icon: 'feather-file-text',
    shown: true
  },
  [SuitePageTabType.Settings]: {
    type: SuitePageTabType.Settings,
    name: 'Settings',
    link: 'settings',
    icon: 'feather-settings',
    shown: true
  }
};

// @todo: this could be moved to an external package that app and api
// can share to ensure types remain consistent
export enum SuiteServiceEvents {
  BatchInsert = 'batchInsert'
}

export interface BatchInsertEvent extends ServerEvent {
  eventType: SuiteServiceEvents.BatchInsert;
  record: BatchItem;
}

const isBatchInsertEvent = (
  eventData: ServerEvent
): eventData is BatchInsertEvent =>
  eventData.eventType === SuiteServiceEvents.BatchInsert;

@Injectable()
export class SuitePageService
  extends IPageService<SuitePageItem>
  implements OnDestroy
{
  private onDestroy$ = new Subject<boolean>();
  private relevantServerEvents: SuiteServiceEvents[] = [
    SuiteServiceEvents.BatchInsert
  ];
  private _bannerSubject = new Subject<SuiteBannerType>();
  banner$ = this._bannerSubject.asObservable();

  private _cache: {
    tabs: PageTab<SuitePageTabType>[];
    team: TeamLookupResponse;
    suites: SuiteItem[];
    suite: SuiteLookupResponse;
    batches: BatchListResponse;
    elements: ElementListResponse;
  } = {
    tabs: undefined,
    team: undefined,
    suites: undefined,
    suite: undefined,
    batches: undefined,
    elements: undefined
  };

  private _subjects = {
    tabs: new Subject<PageTab<SuitePageTabType>[]>(),
    team: new Subject<TeamLookupResponse>(),
    suites: new Subject<SuiteItem[]>(),
    suite: new Subject<SuiteLookupResponse>(),
    batches: new Subject<BatchListResponse>(),
    elements: new Subject<SuitePageElement[]>()
  };

  data = {
    tabs$: this._subjects.tabs.asObservable(),
    team$: this._subjects.team.asObservable(),
    suites$: this._subjects.suites.asObservable(),
    suite$: this._subjects.suite.asObservable(),
    batches$: this._subjects.batches.asObservable(),
    elements$: this._subjects.elements.asObservable()
  };

  constructor(
    private alertService: AlertService,
    private apiService: ApiService,
    private eventService: ServerEventService,
    private userService: UserService
  ) {
    super();
    this.listenForEvents();
    this.routeServerEvent.bind(this);
    this.prepareOneBatchItem.bind(this);
  }

  ngOnDestroy(): void {
    this.onDestroy$.next(true);
    this.onDestroy$.complete();
  }

  /**
   * Listen for server events
   */
  private listenForEvents() {
    this.eventService
      .events()
      .pipe(
        filter((e) => this.relevantServerEvents.includes(e.eventType)),
        takeUntil(this.onDestroy$)
      )
      .subscribe(this.routeServerEvent);
  }

  /**
   * Add single batch to current list of batches in response to server event
   */
  private handleBatchInsert(batchItem: BatchItem) {
    const nextItems = [
      ...this._items,
      this.prepareOneBatchItem(batchItem)
    ].sort(SuitePageItem.compareByDate);

    this._items = nextItems;
    this._itemsSubject.next(this._items);
  }

  /**
   * Direct incoming server-side events to appropriate handler
   */
  private routeServerEvent(e: ServerEvent) {
    if (isBatchInsertEvent(e)) {
      return this.handleBatchInsert(e.record);
    }

    console.warn('suite service took an unrecognized server event:\n', e);
  }

  private update = (key: string, response: unknown) => {
    if (response && !isEqual(response, this._cache[key])) {
      this._cache[key] = response;
      (this._subjects[key] as Subject<unknown>).next(response);
    }
  };

  private prepareTabs() {
    const tabs: PageTab<SuitePageTabType>[] = [
      {
        ...availableTabs.versions,
        counter: this._cache.batches.length
      },
      {
        ...availableTabs.testcases,
        counter: this._cache.elements.length
      },
      availableTabs.settings
    ];
    this.update('tabs', tabs);
  }

  private prepareBatches(doc: BatchListResponse) {
    if (!doc) {
      return;
    }
    this.update('batches', doc);
    const items = doc
      .map(this.prepareOneBatchItem)
      .sort(SuitePageItem.compareByDate);
    if (items && !isEqual(items, this._items)) {
      this._items = items;
      this._itemsSubject.next(this._items);
    }
  }

  private prepareOneBatchItem(batchItem: BatchItem) {
    const batch = { ...(batchItem as FrontendBatchItem) };

    batch.isBaseline =
      batch.batchSlug === this._cache.suite.baseline?.batchSlug;

    return new SuitePageItem(batch, SuitePageItemType.Batch);
  }

  private prepareElements(doc: ElementListResponse) {
    if (!doc) {
      return;
    }
    const items = doc.map(
      (v) => new SuitePageElement(v, SuitePageElementType.Element)
    );
    this.update('elements', items);
  }

  public fetchItems(args: FetchInput): void {
    const url = [
      ['team', args.teamSlug],
      ['suite', args.teamSlug],
      ['suite', args.teamSlug, args.suiteSlug],
      ['batch', args.teamSlug, args.suiteSlug],
      ['element', 'v2', args.teamSlug, args.suiteSlug]
    ];
    const elements = ['team', 'suites', 'suite', 'batches', 'elements'];
    const requests = elements.map((key, index) => {
      return this._cache[key]
        ? of(0)
        : this.apiService.get<unknown>(url[index].join('/'));
    });
    // ensure that we always periodically poll list of versions
    if (args.currentTab == SuitePageTabType.Versions) {
      requests[3] = this.apiService.get<unknown>(url[3].join('/'));
    }
    forkJoin(requests).subscribe({
      next: (doc) => {
        this.update('team', doc[0]);
        this.update('suites', doc[1]);
        this.update('suite', doc[2]);
        this.prepareBatches(doc[3] as BatchListResponse);
        this.prepareElements(doc[4] as ElementListResponse);
        this.prepareTabs();
        this.alertService.unset(
          AlertKind.ApiConnectionDown,
          AlertKind.ApiConnectionLost,
          AlertKind.TeamNotFound,
          AlertKind.SuiteNotFound
        );
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 0) {
          this.alertService.set(
            !this._items
              ? AlertKind.ApiConnectionDown
              : AlertKind.ApiConnectionLost
          );
        } else if (err.status === 401) {
          this.alertService.set(AlertKind.InvalidAuthToken);
        } else if (err.status === 404) {
          this.alertService.set(AlertKind.SuiteNotFound);
        } else {
          errorLogger.notify(err);
        }
      }
    });
  }

  /**
   * Updates new information to all components of the suite page in the event
   * that the suite slug changes during the lifetime of this page.
   *
   * Team slug may change in two cases:
   *  - User switches to another suite
   *  - User updates slug of this suite
   */
  public updateSuiteSlug(
    currentTab: SuitePageTabType,
    suiteSlug: string
  ): void {
    const teamSlug = this._cache.suite.teamSlug;
    this._cache.suites = null;
    this._cache.suite = null;
    this._cache.batches = null;
    this._cache.elements = null;
    this.fetchItems({ currentTab, teamSlug, suiteSlug });
  }

  public updateSubscription(level: ENotificationType): Observable<void> {
    const url = [
      'suite',
      this._cache.suite.teamSlug,
      this._cache.suite.suiteSlug,
      'subscribe'
    ].join('/');
    return this.apiService.patch(url, { level });
  }
}
