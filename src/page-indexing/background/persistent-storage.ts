import {
    StorageModule,
    StorageModuleConfig,
    StorageModuleConstructorArgs,
} from '@worldbrain/storex-pattern-modules'
import { PERSISTENT_STORAGE_VERSIONS } from 'src/storage/constants'

export default class PersistentPageStorage extends StorageModule {
    getConfig = (): StorageModuleConfig => ({
        collections: {
            pageContent: {
                version: PERSISTENT_STORAGE_VERSIONS[0].version,
                fields: {
                    normalizedUrl: { type: 'string' },
                    htmlBody: { type: 'text' },
                },
            },
        },
        operations: {
            createPageContent: {
                operation: 'createObject',
                collection: 'pageContent',
            },
            findPageContentByUrl: {
                operation: 'findObject',
                collection: 'pageContent',
                args: {
                    normalizedUrl: '$normalizedUrl:string',
                },
            },
            updatePageContent: {
                operation: 'updateObjects',
                collection: 'pageContent',
                args: [
                    { normalizedUrl: '$normalizedUrl:string' },
                    { htmlBody: '$htmlBody:string' },
                ],
            },
        },
    })

    async createOrUpdatePage(params: {
        normalizedUrl: string
        htmlBody: string
    }) {
        const existing = await this.operation('findPageContentByUrl', params)
        if (existing) {
            await this.operation('updatePageContent', params)
        } else {
            await this.operation('createPageContent', params)
        }
    }
}
