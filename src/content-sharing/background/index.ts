import pick from 'lodash/pick'
import type StorageManager from '@worldbrain/storex'
import type { StorageOperationEvent } from '@worldbrain/storex-middleware-change-watcher/lib/types'
import type { ContentSharingBackend } from '@worldbrain/memex-common/lib/content-sharing/backend'
import {
    makeAnnotationPrivacyLevel,
    getAnnotationPrivacyState,
    maybeGetAnnotationPrivacyState,
} from '@worldbrain/memex-common/lib/content-sharing/utils'
import type CustomListStorage from 'src/custom-lists/background/storage'
import type { AuthBackground } from 'src/authentication/background'
import type { Analytics } from 'src/analytics/types'
import { AnnotationPrivacyLevels } from '@worldbrain/memex-common/lib/annotations/types'
import { getNoteShareUrl } from 'src/content-sharing/utils'
import type { RemoteEventEmitter } from 'src/util/webextensionRPC'
import type ActivityStreamsBackground from 'src/activity-streams/background'
import type { Services } from 'src/services/types'
import type { ServerStorageModules } from 'src/storage/types'
import type {
    ContentSharingInterface,
    AnnotationSharingState,
    AnnotationSharingStates,
} from './types'
import { ContentSharingClientStorage } from './storage'
import type { GenerateServerID } from '../../background-script/types'
import AnnotationStorage from 'src/annotations/background/storage'

export default class ContentSharingBackground {
    remoteFunctions: ContentSharingInterface
    storage: ContentSharingClientStorage

    _ensuredPages: { [normalizedUrl: string]: string } = {}

    constructor(
        public options: {
            storageManager: StorageManager
            backend: ContentSharingBackend
            customLists: CustomListStorage
            annotations: AnnotationStorage
            auth: AuthBackground
            analytics: Analytics
            activityStreams: Pick<ActivityStreamsBackground, 'backend'>
            services: Pick<Services, 'contentSharing'>
            captureException?: (e: Error) => void
            remoteEmitter: RemoteEventEmitter<'contentSharing'>
            getServerStorage: () => Promise<
                Pick<ServerStorageModules, 'contentSharing'>
            >
            generateServerId: GenerateServerID
        },
    ) {
        this.storage = new ContentSharingClientStorage({
            storageManager: options.storageManager,
        })

        this.remoteFunctions = {
            ...options.services.contentSharing,
            shareList: this.shareList,
            shareAnnotation: this.shareAnnotation,
            shareAnnotations: this.shareAnnotations,
            executePendingActions: this.executePendingActions.bind(this),
            shareAnnotationsToAllLists: this.shareAnnotationsToAllLists,
            unshareAnnotationsFromAllLists: this.unshareAnnotationsFromAllLists,
            shareAnnotationToSomeLists: this.shareAnnotationToSomeLists,
            unshareAnnotationFromSomeLists: this.unshareAnnotationFromSomeLists,
            unshareAnnotations: this.unshareAnnotations,
            ensureRemotePageId: this.ensureRemotePageId,
            getRemoteAnnotationLink: this.getRemoteAnnotationLink,
            findAnnotationPrivacyLevels: this.findAnnotationPrivacyLevels.bind(
                this,
            ),
            setAnnotationPrivacyLevel: this.setAnnotationPrivacyLevel,
            deleteAnnotationPrivacyLevel: this.deleteAnnotationPrivacyLevel,
            generateRemoteAnnotationId: async () =>
                this.generateRemoteAnnotationId(),
            getRemoteListId: async (callOptions) => {
                return this.storage.getRemoteListId({
                    localId: callOptions.localListId,
                })
            },
            getRemoteListIds: async (callOptions) => {
                return this.storage.getRemoteListIds({
                    localIds: callOptions.localListIds,
                })
            },
            getRemoteAnnotationIds: async (callOptions) => {
                return this.storage.getRemoteAnnotationIds({
                    localIds: callOptions.annotationUrls,
                })
            },
            getRemoteAnnotationMetadata: async (callOptions) => {
                return this.storage.getRemoteAnnotationMetadata({
                    localIds: callOptions.annotationUrls,
                })
            },
            areListsShared: async (callOptions) => {
                return this.storage.areListsShared({
                    localIds: callOptions.localListIds,
                })
            },
            getAnnotationSharingState: this.getAnnotationSharingState,
            getAnnotationSharingStates: this.getAnnotationSharingStates,
            getAllRemoteLists: this.getAllRemoteLists,
            waitForSync: this.waitForSync,
            getListsForAnnotations: this.getListsForAnnotations,
            getListsForAnnotation: this.getListsForAnnotation,
            addAnnotationToLists: this.addAnnotationToLists,
            removeAnnotationsFromLists: this.removeAnnotationsFromLists,
            suggestSharedLists: this.suggestSharedLists,
            unshareAnnotation: this.unshareAnnotation,
            deleteAnnotationShare: this.deleteAnnotationShare,
        }
    }

    async setup() {}

    async executePendingActions() {}

    private generateRemoteAnnotationId = (): string =>
        this.options.generateServerId('sharedAnnotation').toString()

    private getRemoteAnnotationLink: ContentSharingInterface['getRemoteAnnotationLink'] = async ({
        annotationUrl,
    }) => {
        const remoteIds = await this.storage.getRemoteAnnotationIds({
            localIds: [annotationUrl],
        })
        const remoteAnnotationId = remoteIds[annotationUrl]?.toString()

        if (remoteAnnotationId == null) {
            return null
        }

        return getNoteShareUrl({ remoteAnnotationId })
    }

    getAllRemoteLists: ContentSharingInterface['getAllRemoteLists'] = async () => {
        const remoteListIdsDict = await this.storage.getAllRemoteListIds()
        const remoteListData: Array<{
            localId: number
            remoteId: string
            name: string
        }> = []

        for (const localId of Object.keys(remoteListIdsDict).map(Number)) {
            const list = await this.options.customLists.fetchListById(localId)
            remoteListData.push({
                localId,
                remoteId: remoteListIdsDict[localId],
                name: list.name,
            })
        }

        return remoteListData
    }

    shareList: ContentSharingInterface['shareList'] = async (options) => {
        const existingRemoteId = await this.storage.getRemoteListId({
            localId: options.listId,
        })
        if (existingRemoteId) {
            return { remoteListId: existingRemoteId }
        }

        const localList = await this.options.customLists.fetchListById(
            options.listId,
        )
        if (!localList) {
            throw new Error(
                `Tried to share non-existing list: ID ${options.listId}`,
            )
        }

        const remoteListId = this.options
            .generateServerId('sharedList')
            .toString()
        await this.storage.storeListId({
            localId: options.listId,
            remoteId: remoteListId,
        })

        this.options.analytics.trackEvent({
            category: 'ContentSharing',
            action: 'shareList',
        })

        return {
            remoteListId,
        }
    }

    shareAnnotation: ContentSharingInterface['shareAnnotation'] = async (
        options,
    ) => {
        let remoteId = (
            await this.storage.getRemoteAnnotationIds({
                localIds: [options.annotationUrl],
            })
        )[options.annotationUrl]

        if (!remoteId) {
            remoteId =
                options.remoteAnnotationId ?? this.generateRemoteAnnotationId()
            await this.storage.storeAnnotationMetadata([
                {
                    localId: options.annotationUrl,
                    excludeFromLists: !options.shareToLists ?? true,
                    remoteId,
                },
            ])
        }

        if (!options.skipPrivacyLevelUpdate) {
            await this.storage.setAnnotationPrivacyLevel({
                annotation: options.annotationUrl,
                privacyLevel: makeAnnotationPrivacyLevel({
                    public: options.shareToLists,
                    protected: options.setBulkShareProtected,
                }),
            })
        }

        this.options.analytics.trackEvent({
            category: 'ContentSharing',
            action: 'shareAnnotation',
        })

        return { remoteId }
    }

    shareAnnotations: ContentSharingInterface['shareAnnotations'] = async (
        options,
    ) => {
        const remoteIds = await this.storage.getRemoteAnnotationIds({
            localIds: options.annotationUrls,
        })
        const annotPrivacyLevels = await this.storage.getPrivacyLevelsByAnnotation(
            { annotations: options.annotationUrls },
        )
        const nonProtectedAnnotations = options.annotationUrls.filter(
            (url) =>
                ![
                    AnnotationPrivacyLevels.PROTECTED,
                    AnnotationPrivacyLevels.SHARED_PROTECTED,
                ].includes(annotPrivacyLevels[url]?.privacyLevel),
        )

        await this.storage.storeAnnotationMetadata(
            nonProtectedAnnotations.map((localId) => ({
                localId,
                remoteId:
                    remoteIds[localId] ?? this.generateRemoteAnnotationId(),
                excludeFromLists: !options.shareToLists ?? true,
            })),
        )

        await this.storage.setAnnotationPrivacyLevelBulk({
            annotations: nonProtectedAnnotations,
            privacyLevel: makeAnnotationPrivacyLevel({
                public: options.shareToLists,
                protected: options.setBulkShareProtected,
            }),
        })

        return { sharingStates: {} }
    }

    shareAnnotationsToAllLists: ContentSharingInterface['shareAnnotationsToAllLists'] = async (
        options,
    ) => {
        const allMetadata = await this.storage.getRemoteAnnotationMetadata({
            localIds: options.annotationUrls,
        })
        await this.storage.setAnnotationsExcludedFromLists({
            localIds: options.annotationUrls.filter(
                (url) => allMetadata[url]?.excludeFromLists,
            ),
            excludeFromLists: false,
        })

        return { sharingStates: {} }
    }

    ensureRemotePageId: ContentSharingInterface['ensureRemotePageId'] = async (
        normalizedPageUrl,
    ) => {
        const userId = (await this.options.auth.authService.getCurrentUser())
            ?.id
        if (!userId) {
            throw new Error(
                `Tried to execute sharing action without being authenticated`,
            )
        }
        if (this._ensuredPages[normalizedPageUrl]) {
            return this._ensuredPages[normalizedPageUrl]
        }

        const userReference = {
            type: 'user-reference' as 'user-reference',
            id: userId,
        }

        const page = (
            await this.storage.getPages({
                normalizedPageUrls: [normalizedPageUrl],
            })
        )[normalizedPageUrl]
        const { contentSharing } = await this.options.getServerStorage()
        const reference = await contentSharing.ensurePageInfo({
            pageInfo: pick(page, 'fullTitle', 'originalUrl', 'normalizedUrl'),
            creatorReference: userReference,
        })
        const id = contentSharing.getSharedPageInfoLinkID(reference)
        this._ensuredPages[normalizedPageUrl] = id
        return id
    }

    unshareAnnotationsFromAllLists: ContentSharingInterface['unshareAnnotationsFromAllLists'] = async (
        options,
    ) => {
        const allMetadata = await this.storage.getRemoteAnnotationMetadata({
            localIds: options.annotationUrls,
        })
        await this.storage.setAnnotationsExcludedFromLists({
            localIds: options.annotationUrls.filter(
                (url) => !allMetadata[url]?.excludeFromLists,
            ),
            excludeFromLists: true,
        })
        await this.storage.setAnnotationPrivacyLevelBulk({
            annotations: options.annotationUrls,
            privacyLevel: options.setBulkShareProtected
                ? AnnotationPrivacyLevels.PROTECTED
                : AnnotationPrivacyLevels.PRIVATE,
        })

        return { sharingStates: {} }
    }

    shareAnnotationToSomeLists: ContentSharingInterface['shareAnnotationToSomeLists'] = async (
        options,
    ) => {
        const sharingState = await this.getAnnotationSharingState(options)
        sharingState.privacyLevel = AnnotationPrivacyLevels.PROTECTED
        await this.storage.setAnnotationPrivacyLevel({
            annotation: options.annotationUrl,
            privacyLevel: sharingState.privacyLevel,
        })
        if (!sharingState.remoteId) {
            const { remoteId } = await this.shareAnnotation({
                annotationUrl: options.annotationUrl,
                skipPrivacyLevelUpdate: true,
            })
            sharingState.remoteId = remoteId
            sharingState.hasLink = true
        }
        for (const listId of options.localListIds) {
            if (sharingState.localListIds.includes(listId)) {
                continue
            }
            await this.options.annotations.insertAnnotToList({
                listId,
                url: options.annotationUrl,
            })
            sharingState.localListIds.push(listId)
        }
        return { sharingState }
    }

    unshareAnnotationFromSomeLists: ContentSharingInterface['unshareAnnotationFromSomeLists'] = async (
        options,
    ) => {
        for (const listId of options.localListIds) {
            await this.options.annotations.removeAnnotFromList({
                listId,
                url: options.annotationUrl,
            })
        }
        return { sharingState: dummyAnnotationSharingState() }
    }

    unshareAnnotations: ContentSharingInterface['unshareAnnotations'] = async (
        options,
    ) => {
        const annotPrivacyLevels = await this.storage.getPrivacyLevelsByAnnotation(
            { annotations: options.annotationUrls },
        )
        const nonProtectedAnnotations = options.annotationUrls.filter(
            (annotationUrl) =>
                ![
                    AnnotationPrivacyLevels.PROTECTED,
                    AnnotationPrivacyLevels.SHARED_PROTECTED,
                ].includes(annotPrivacyLevels[annotationUrl]?.privacyLevel),
        )

        const allMetadata = await this.storage.getRemoteAnnotationMetadata({
            localIds: nonProtectedAnnotations,
        })
        await this.storage.setAnnotationsExcludedFromLists({
            localIds: Object.values(allMetadata)
                .filter((metadata) => !metadata.excludeFromLists)
                .map(({ localId }) => localId),
            excludeFromLists: true,
        })

        await this.storage.setAnnotationPrivacyLevelBulk({
            annotations: nonProtectedAnnotations,
            privacyLevel: options.setBulkShareProtected
                ? AnnotationPrivacyLevels.PROTECTED
                : AnnotationPrivacyLevels.PRIVATE,
        })

        return { sharingStates: {} }
    }

    unshareAnnotation: ContentSharingInterface['unshareAnnotation'] = async (
        options,
    ) => {
        const privacyState = maybeGetAnnotationPrivacyState(
            (
                await this.storage.findAnnotationPrivacyLevel({
                    annotation: options.annotationUrl,
                })
            ).privacyLevel,
        )
        await this.storage.deleteAnnotationMetadata({
            localIds: [options.annotationUrl],
        })
        if (privacyState?.public) {
            await this.storage.setAnnotationPrivacyLevel({
                annotation: options.annotationUrl,
                privacyLevel: AnnotationPrivacyLevels.PRIVATE,
            })
        }
        return { sharingState: dummyAnnotationSharingState() }
    }

    deleteAnnotationShare: ContentSharingInterface['deleteAnnotationShare'] = async (
        options,
    ) => {
        await this.storage.deleteAnnotationMetadata({
            localIds: [options.annotationUrl],
        })
        await this.storage.deleteAnnotationPrivacyLevel({
            annotation: options.annotationUrl,
        })
    }

    findAnnotationPrivacyLevels: ContentSharingInterface['findAnnotationPrivacyLevels'] = async (
        params,
    ) => {
        const storedLevels = await this.storage.getPrivacyLevelsByAnnotation({
            annotations: params.annotationUrls,
        })

        const privacyLevels = {}
        for (const annotationUrl of params.annotationUrls) {
            privacyLevels[annotationUrl] =
                storedLevels[annotationUrl]?.privacyLevel ??
                AnnotationPrivacyLevels.PRIVATE
        }
        return privacyLevels
    }

    setAnnotationPrivacyLevel: ContentSharingInterface['setAnnotationPrivacyLevel'] = async (
        params,
    ) => {
        if (
            params.privacyLevel === AnnotationPrivacyLevels.SHARED ||
            params.privacyLevel === AnnotationPrivacyLevels.SHARED_PROTECTED
        ) {
            const { remoteId } = await this.shareAnnotation({
                annotationUrl: params.annotation,
                setBulkShareProtected:
                    params.privacyLevel ===
                    AnnotationPrivacyLevels.SHARED_PROTECTED,
                shareToLists: true,
            })
            return { remoteId, sharingState: dummyAnnotationSharingState() }
        } else {
            await this.unshareAnnotationsFromAllLists({
                annotationUrls: [params.annotation],
                setBulkShareProtected:
                    params.privacyLevel === AnnotationPrivacyLevels.PROTECTED,
            })
            return { sharingState: dummyAnnotationSharingState() }
        }
    }

    deleteAnnotationPrivacyLevel: ContentSharingInterface['deleteAnnotationPrivacyLevel'] = async (
        params,
    ) => {
        await this.storage.deleteAnnotationPrivacyLevel(params)
    }

    waitForSync: ContentSharingInterface['waitForSync'] = async () => {}

    getAnnotationSharingState: ContentSharingInterface['getAnnotationSharingState'] = async (
        params,
    ) => {
        const [entries, privacyLevel, remoteIds] = await Promise.all([
            this.options.annotations.findListEntriesByUrl({
                url: params.annotationUrl,
            }),
            this.storage.findAnnotationPrivacyLevel({
                annotation: params.annotationUrl,
            }),
            this.storage.getRemoteAnnotationIds({
                localIds: [params.annotationUrl],
            }),
        ])
        const remoteId = remoteIds[params.annotationUrl]
        return {
            hasLink: !!remoteId,
            remoteId,
            localListIds: entries.map((entry) => entry.listId),
            privacyLevel:
                privacyLevel?.privacyLevel ?? AnnotationPrivacyLevels.PRIVATE,
        }
    }

    getAnnotationSharingStates: ContentSharingInterface['getAnnotationSharingStates'] = async (
        params,
    ) => {
        // TODO: Optimize, this should only take 3 queries, not 3 * annotationCount
        const states: AnnotationSharingStates = {}
        await Promise.all(
            params.annotationUrls.map(async (annotationUrl) => {
                states[annotationUrl] = await this.getAnnotationSharingState({
                    annotationUrl,
                })
            }),
        )
        return states
    }

    getListsForAnnotations = async ({
        annotationUrls,
    }: {
        annotationUrls: string[]
    }): Promise<{ [annotationUrl: string]: string[] }> => {
        console.log('getListsForAnnotations')
        return annotationUrls.reduce((a, v) => ({ ...a, [v]: [] }), {})
    }
    getListsForAnnotation = async (
        annotationUrl: string,
    ): Promise<string[]> => {
        console.log('getListsForAnnotation')
        return []
    }
    addAnnotationToLists = async (args: {
        annotationUrl: string
        listIds: number[]
    }): Promise<void> => {
        console.log('addAnnotationToLists')
        return
    }
    removeAnnotationsFromLists = async (args: {
        annotationUrl: string
        listIds: number[]
    }): Promise<void> => {
        console.log('removeAnnotationsFromLists')
        return
    }

    suggestSharedLists: ContentSharingInterface['suggestSharedLists'] = async (
        params,
    ) => {
        const loweredPrefix = params.prefix.toLowerCase()
        const lists = await this.options.customLists.fetchAllLists({
            limit: 10000,
            skip: 0,
        })
        const remoteIds = await this.storage.getAllRemoteListIds()
        const suggestions: Array<{ localId: number; name: string }> = []
        for (const list of lists) {
            if (
                remoteIds[list.id] &&
                list.name.toLowerCase().startsWith(loweredPrefix)
            ) {
                suggestions.push({ localId: list.id, name: list.name })
            }
        }
        return suggestions
    }

    async handlePostStorageChange(
        event: StorageOperationEvent<'post'>,
        options: {
            source: 'sync' | 'local'
        },
    ) {}
}

function dummyAnnotationSharingState(): AnnotationSharingState {
    return {
        hasLink: false,
        privacyLevel: AnnotationPrivacyLevels.PRIVATE,
        localListIds: [],
    }
}
