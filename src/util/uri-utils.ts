import browser from 'webextension-polyfill'
import { isUrlPDFViewerUrl } from 'src/pdf/util'

/**
 * Some URLs, like those of the PDF viewer, hide away the underlying resource's URL.
 * This function will detect special cases and return the underlying resource's URL, if a special case.
 * Should operate like identity function for non-special cases.
 */
export const getUnderlyingResourceUrl = (url: string) => {
    if (isUrlPDFViewerUrl(url, { runtimeAPI: browser.runtime })) {
        return new URL(url).searchParams.get('file')
    }

    return url
}

export const filterTabUrl = (tab) => {
    if (tab) {
        tab.url = getUnderlyingResourceUrl(tab.url)
    }
    return tab
}
