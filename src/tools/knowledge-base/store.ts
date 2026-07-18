import { defineStore } from "pinia";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  createKnowledgeLibrary,
  applyKnowledgeLibraryConfig,
  deleteKnowledgeDocument,
  deleteKnowledgeLibrary,
  getKnowledgeIndexStatus,
  ingestKnowledgeDocument,
  listKnowledgeChunks,
  listKnowledgeDocuments,
  listKnowledgeLibraries,
  rebuildKnowledgeLibrary,
  searchKnowledge,
  updateKnowledgeLibrary,
} from "./service";
import type {
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeImportFailure,
  KnowledgeIndexStatus,
  KnowledgeLibrary,
  KnowledgeLibraryIndexConfig,
  KnowledgeLibraryUpdate,
  KnowledgeResult,
  KnowledgeSearchStrategy,
} from "./types";

const errorHandler = createModuleErrorHandler("knowledge-base/store");

export const useKnowledgeStore = defineStore("knowledge-base", {
  state: () => ({
    libraries: [] as KnowledgeLibrary[],
    documents: [] as KnowledgeDocument[],
    chunks: [] as KnowledgeChunk[],
    results: [] as KnowledgeResult[],
    activeLibraryId: null as string | null,
    selectedDocumentId: null as string | null,
    selectedResultId: null as string | null,
    indexStatus: null as KnowledgeIndexStatus | null,
    loading: false,
    documentsLoading: false,
    chunksLoading: false,
    importing: false,
    importProcessed: 0,
    importTotal: 0,
    searching: false,
  }),

  getters: {
    activeLibrary(state): KnowledgeLibrary | null {
      return (
        state.libraries.find((item) => item.id === state.activeLibraryId) ||
        null
      );
    },
    selectedDocument(state): KnowledgeDocument | null {
      return (
        state.documents.find((item) => item.id === state.selectedDocumentId) ||
        null
      );
    },
    selectedResult(state): KnowledgeResult | null {
      return (
        state.results.find((item) => item.chunkId === state.selectedResultId) ||
        null
      );
    },
  },

  actions: {
    async initialize() {
      this.loading = true;
      try {
        await this.refreshLibraries();
      } catch (error) {
        errorHandler.error(error, "初始化知识资料库失败");
      } finally {
        this.loading = false;
      }
    },

    async refreshLibraries(preferredId?: string) {
      const previousId = this.activeLibraryId;
      this.libraries = await listKnowledgeLibraries();
      const nextId = preferredId || this.activeLibraryId;
      this.activeLibraryId = this.libraries.some((item) => item.id === nextId)
        ? nextId
        : this.libraries[0]?.id || null;
      if (previousId !== this.activeLibraryId) {
        this.results = [];
        this.selectedResultId = null;
        this.selectedDocumentId = null;
        this.chunks = [];
        this.indexStatus = null;
      }
      await this.refreshDocuments();
    },

    async selectLibrary(libraryId: string) {
      if (libraryId === this.activeLibraryId) return;
      this.activeLibraryId = libraryId;
      this.results = [];
      this.selectedResultId = null;
      this.selectedDocumentId = null;
      this.chunks = [];
      this.indexStatus = null;
      await this.refreshDocuments();
    },

    async refreshDocuments() {
      this.documentsLoading = true;
      try {
        this.documents = this.activeLibraryId
          ? await listKnowledgeDocuments(this.activeLibraryId)
          : [];
        if (
          !this.documents.some((item) => item.id === this.selectedDocumentId)
        ) {
          this.selectedDocumentId = null;
          this.chunks = [];
        }
        await this.refreshIndexStatus();
      } finally {
        this.documentsLoading = false;
      }
    },

    async refreshIndexStatus() {
      this.indexStatus = this.activeLibraryId
        ? await getKnowledgeIndexStatus(this.activeLibraryId)
        : null;
    },

    async selectDocument(documentId: string) {
      if (!this.activeLibraryId) return;
      this.selectedDocumentId = documentId;
      this.chunksLoading = true;
      try {
        this.chunks = await listKnowledgeChunks(
          this.activeLibraryId,
          documentId
        );
      } finally {
        this.chunksLoading = false;
      }
    },

    async createLibrary(
      name: string,
      description?: string,
      config?: KnowledgeLibraryIndexConfig
    ) {
      const library = await createKnowledgeLibrary(name, description, config);
      await this.refreshLibraries(library.id);
      return library;
    },

    async updateActiveLibrary(update: KnowledgeLibraryUpdate) {
      if (!this.activeLibraryId) return null;
      const library = await updateKnowledgeLibrary(
        this.activeLibraryId,
        update
      );
      await this.refreshLibraries(library.id);
      return library;
    },

    async applyActiveLibraryConfig(config: KnowledgeLibraryIndexConfig) {
      if (!this.activeLibraryId) return 0;
      const count = await applyKnowledgeLibraryConfig(
        this.activeLibraryId,
        config
      );
      this.results = [];
      this.selectedResultId = null;
      await this.refreshLibraries(this.activeLibraryId);
      return count;
    },

    async deleteActiveLibrary() {
      if (!this.activeLibraryId) return;
      await deleteKnowledgeLibrary(this.activeLibraryId);
      this.results = [];
      await this.refreshLibraries();
    },

    async importFiles(
      files: Array<{
        sourcePath: string;
        title: string;
        mimeType: string;
        content: string;
      }>
    ): Promise<{ imported: number; failures: KnowledgeImportFailure[] }> {
      if (!this.activeLibraryId) return { imported: 0, failures: [] };
      this.importing = true;
      this.importProcessed = 0;
      this.importTotal = files.length;
      let imported = 0;
      const failures: KnowledgeImportFailure[] = [];
      try {
        for (const file of files) {
          try {
            await ingestKnowledgeDocument({
              libraryId: this.activeLibraryId,
              ...file,
            });
            imported += 1;
          } catch (error) {
            failures.push({
              sourcePath: file.sourcePath,
              fileName:
                file.sourcePath.split(/[\\/]/).pop() || file.sourcePath,
              stage: "ingest",
              message: error instanceof Error ? error.message : String(error),
            });
          } finally {
            this.importProcessed += 1;
          }
        }
        this.results = [];
        this.selectedResultId = null;
        await this.refreshLibraries(this.activeLibraryId);
        return { imported, failures };
      } finally {
        this.importing = false;
      }
    },

    async deleteDocument(documentId: string) {
      if (!this.activeLibraryId) return;
      await deleteKnowledgeDocument(this.activeLibraryId, documentId);
      if (this.selectedDocumentId === documentId) {
        this.selectedDocumentId = null;
        this.chunks = [];
      }
      this.results = [];
      this.selectedResultId = null;
      await this.refreshLibraries(this.activeLibraryId);
    },

    async rebuild() {
      if (!this.activeLibraryId) return 0;
      const count = await rebuildKnowledgeLibrary(this.activeLibraryId);
      this.results = [];
      this.selectedResultId = null;
      await this.refreshLibraries(this.activeLibraryId);
      return count;
    },

    async search(
      query: string,
      strategy: KnowledgeSearchStrategy = "auto",
      limit = 12
    ) {
      if (!this.activeLibraryId || !query.trim()) {
        this.results = [];
        return [];
      }
      this.searching = true;
      try {
        this.results = await searchKnowledge({
          query: query.trim(),
          libraryIds: [this.activeLibraryId],
          strategy,
          limit,
          minScore: 0,
        });
        this.selectedResultId = this.results[0]?.chunkId || null;
        return this.results;
      } catch (error) {
        errorHandler.error(error, "检索知识资料库失败");
        this.results = [];
        this.selectedResultId = null;
        return [];
      } finally {
        this.searching = false;
      }
    },

    selectResult(chunkId: string) {
      this.selectedResultId = chunkId;
    },
  },
});
