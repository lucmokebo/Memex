import type { SyncSettingNames } from './types'

export const COLLECTION_NAMES = {
    settings: 'settings',
}

export const FEATURE_PREFIX = {
    ACTIVITY_INDICATOR: '@ActivityIndicator-',
    SEARCH_INJECTION: '@SearchInjection-',
    CONTENT_SHARING: '@ContentSharing-',
    PDF_INTEGRATION: '@PDFIntegration-',
    IN_PAGE_UI: '@InPageUI-',
    DASHBOARD: '@Dashboard-',
    EXTENSION: '@Extension-',
    READWISE: 'readwise.',
    OPENAI: 'openAI.',
}

export const SETTING_NAMES: SyncSettingNames = {
    activityIndicator: {
        feedHasActivity: FEATURE_PREFIX.ACTIVITY_INDICATOR + 'feedHasActivity',
    },
    contentSharing: {
        lastSharedAnnotationTimestamp:
            FEATURE_PREFIX.CONTENT_SHARING + 'lastSharedAnnotationTimestamp',
    },
    dashboard: {
        listSidebarLocked: FEATURE_PREFIX.DASHBOARD + 'listSidebarLocked',
        onboardingMsgSeen: FEATURE_PREFIX.DASHBOARD + 'onboardingMsgSeen',
        subscribeBannerShownAfter:
            FEATURE_PREFIX.DASHBOARD + 'subscribeBannerShownAfter',
    },
    extension: {
        blocklist: FEATURE_PREFIX.EXTENSION + 'blocklist',
        keyboardShortcuts: FEATURE_PREFIX.EXTENSION + 'keyboard_shortcuts',
        areTagsMigratedToSpaces:
            FEATURE_PREFIX.EXTENSION + 'are_tags_migrated_to_spaces',
        shouldTrackAnalytics:
            FEATURE_PREFIX.EXTENSION + 'should_track_analytics',
    },
    pdfIntegration: {
        shouldAutoOpen: FEATURE_PREFIX.PDF_INTEGRATION + 'should_auto_open',
    },
    inPageUI: {
        ribbonEnabled: FEATURE_PREFIX.IN_PAGE_UI + 'ribbon_enabled',
        tooltipEnabled: FEATURE_PREFIX.IN_PAGE_UI + 'tooltip_enabled',
        highlightsEnabled: FEATURE_PREFIX.IN_PAGE_UI + 'highlights_enabled',
        ribbonPosition: FEATURE_PREFIX.IN_PAGE_UI + 'ribbon_position',
    },
    searchInjection: {
        hideMemexResults: FEATURE_PREFIX.SEARCH_INJECTION + 'hideMemexResults',
        memexResultsPosition:
            FEATURE_PREFIX.SEARCH_INJECTION + 'memexResultsPosition',
        searchEnginesEnabled:
            FEATURE_PREFIX.SEARCH_INJECTION + 'searchEnginesEnabled',
    },
    readwise: {
        apiKey: FEATURE_PREFIX.READWISE + 'apiKey',
    },
    openAI: {
        apiKey: FEATURE_PREFIX.OPENAI + 'apiKey',
        promptSuggestions: FEATURE_PREFIX.OPENAI + 'promptSuggestions',
    },
}
