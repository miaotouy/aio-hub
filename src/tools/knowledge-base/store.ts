import { defineStore } from "pinia";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  createKnowledgeLibrary,
  deleteKnowledgeDocument,
  deleteKnowledgeLibrary,
  ingestKnowledgeDocument,
  listKnowledgeDocuments,
  listKnowledgeLibraries,
  rebuildKnowledgeLibrary,
  searchKnowledge,
} from "./service";
import type {
  KnowledgeDocument,
  KnowledgeLibrary,
  KnowledgeResult,
  KnowledgeSearchStrategy,
} from "./types";

const errorHandler = createModuleErrorHandler("knowledge-base/store");

export const useKnowledgeStore = defineStore("knowledge-base", {
  state: () => ({
    libraries: [] as KnowledgeLibrary[],
    documents: [] as KnowledgeDocument[],
    results: [] as KnowledgeResult[],
    activeLibraryId: null as string | null,
    loading: false,
    importing: false,
    searching: false,
  }),

  getters: {
    activeLibrary(state): KnowledgeLibrary | null {
      return (
        state.libraries.find((item) => item.id === state.activeLibraryId) ||
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
      this.libraries = await listKnowledgeLibraries();
      const nextId = preferredId || this.activeLibraryId;
      this.activeLibraryId = this.libraries.some((item) => item.id === nextId)
        ? nextId
        : this.libraries[0]?.id || null;
      await this.refreshDocuments();
    },

    async selectLibrary(libraryId: string) {
      if (libraryId === this.activeLibraryId) return;
      this.activeLibraryId = libraryId;
      this.results = [];
      await this.refreshDocuments();
    },

    async refreshDocuments() {
      this.documents = this.activeLibraryId
        ? await listKnowledgeDocuments(this.activeLibraryId)
        : [];
    },

    async createLibrary(name: string, description?: string) {
      const library = await createKnowledgeLibrary(name, description);
      await this.refreshLibraries(library.id);
      return library;
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
    ) {
      if (!this.activeLibraryId) return;
      this.importing = true;
      try {
        for (const file of files) {
          await ingestKnowledgeDocument({
            libraryId: this.activeLibraryId,
            ...file,
          });
        }
        await this.refreshLibraries(this.activeLibraryId);
      } finally {
        this.importing = false;
      }
    },

    async deleteDocument(documentId: string) {
      if (!this.activeLibraryId) return;
      await deleteKnowledgeDocument(this.activeLibraryId, documentId);
      await this.refreshLibraries(this.activeLibraryId);
    },

    async rebuild() {
      if (!this.activeLibraryId) return 0;
      const count = await rebuildKnowledgeLibrary(this.activeLibraryId);
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
        return this.results;
      } catch (error) {
        errorHandler.error(error, "检索知识资料库失败");
        this.results = [];
        return [];
      } finally {
        this.searching = false;
      }
    },
  },
});
