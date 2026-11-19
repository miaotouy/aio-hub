// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type Ref,
} from "vue";

export interface DraftReceipt<T, R> {
  value: T;
  revision: R;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Each selected form owns its baseline, in-flight snapshot and editable watermark. */
export function useDraftAutoSave<T extends { id: string }, R>(options: {
  initial: T;
  save: (
    value: T,
    options: { expectedRevision: R }
  ) => Promise<DraftReceipt<T, R>>;
  validate: (value: T) => boolean;
  normalize?: (value: T) => T;
  delay?: number;
}) {
  const sessions = new Map<string, Session>();
  type Session = {
    draft: Ref<T>;
    committed: Ref<T>;
    baseRevision: Ref<R>;
    editVersion: Ref<number>;
    savedVersion: Ref<number>;
    inFlightVersion: Ref<number | null>;
    lastError: Ref<unknown>;
    timer?: ReturnType<typeof setTimeout>;
    pending?: Promise<boolean>;
    muted: boolean;
    discarded: boolean;
  };
  const active = shallowRef<Session>();
  const empty = ref(clone(options.initial)) as Ref<T>;
  const draft = computed({
    get: () => active.value?.draft.value ?? empty.value,
    set: (value) => {
      if (active.value) active.value.draft.value = value;
      else empty.value = value;
    },
  });
  const dirty = (session: Session) =>
    session.editVersion.value !== session.savedVersion.value ||
    session.lastError.value !== null;
  const isDirty = computed(() => (active.value ? dirty(active.value) : false));
  const lastError = computed(() => active.value?.lastError.value ?? null);
  const hasConflict = computed(() => {
    const error = lastError.value;
    return (
      !!error &&
      typeof error === "object" &&
      "code" in error &&
      ["DRAFT_CONFLICT", "LLM_CONFIG_CONFLICT", "OCR_CONFIG_CONFLICT"].includes(
        String(error.code)
      )
    );
  });
  const isSaving = computed(() => active.value?.inFlightVersion.value != null);
  const editVersion = computed(() => active.value?.editVersion.value ?? 0);
  const savedVersion = computed(() => active.value?.savedVersion.value ?? 0);
  const baseRevision = computed(() => active.value?.baseRevision.value);
  const committedSnapshot = computed(() => active.value?.committed.value);
  const clearTimer = (session: Session) => {
    clearTimeout(session.timer);
    session.timer = undefined;
  };
  const schedule = (session: Session) => {
    clearTimer(session);
    session.timer = setTimeout(() => {
      session.timer = undefined;
      void submit(session);
    }, options.delay ?? 1000);
  };
  let observed: Session | undefined;
  watch(
    draft,
    () => {
      const session = active.value;
      if (observed !== session) {
        observed = session;
        return;
      }
      if (!session || session.muted) return;
      session.editVersion.value++;
      schedule(session);
    },
    { deep: true, flush: "sync" }
  );

  function submit(session: Session): Promise<boolean> {
    clearTimer(session);
    if (session.discarded || !dirty(session)) return Promise.resolve(true);
    if (session.pending) return session.pending;
    const payload =
      options.normalize?.(clone(session.draft.value)) ??
      clone(session.draft.value);
    if (!options.validate(payload)) return Promise.resolve(false);
    const submittedVersion = session.editVersion.value;
    const expectedRevision = session.baseRevision.value;
    session.inFlightVersion.value = submittedVersion;
    // Start save synchronously so leaving a view captures its final edit immediately.
    session.pending = options
      .save(payload, { expectedRevision })
      .then((receipt) => {
        session.committed.value = clone(receipt.value);
        session.baseRevision.value = receipt.revision;
        session.savedVersion.value = submittedVersion;
        session.lastError.value = null;
        if (
          session.editVersion.value === submittedVersion &&
          !session.discarded
        ) {
          session.muted = true;
          session.draft.value = clone(receipt.value);
          session.muted = false;
        }
        return true;
      })
      .catch((error) => {
        session.lastError.value = error;
        return false;
      })
      .finally(() => {
        session.pending = undefined;
        session.inFlightVersion.value = null;
        // A failed write waits for a real edit or an explicit retry.
        if (
          !session.discarded &&
          session.lastError.value === null &&
          dirty(session)
        )
          schedule(session);
      });
    return session.pending;
  }

  const open = (value: T, revision: R, modified = false, reset = false) => {
    const previous = sessions.get(value.id);
    if (previous && !reset) {
      active.value = previous;
      sync(value, revision);
      return;
    }
    if (previous) {
      clearTimer(previous);
      previous.discarded = true;
    }
    const session: Session = {
      draft: ref(clone(value)) as Ref<T>,
      committed: shallowRef(clone(value)) as Ref<T>,
      baseRevision: shallowRef(revision) as Ref<R>,
      editVersion: ref(modified ? 1 : 0),
      savedVersion: ref(0),
      inFlightVersion: ref(null),
      lastError: shallowRef(null),
      muted: false,
      discarded: false,
    };
    sessions.set(value.id, session);
    active.value = session;
    if (modified) schedule(session);
  };
  function sync(value: T, revision: R) {
    const session = active.value;
    if (
      !session ||
      session.draft.value.id !== value.id ||
      session.inFlightVersion.value !== null ||
      session.baseRevision.value === revision
    )
      return;
    // Another channel's write advances the collection revision without changing this draft's baseline.
    if (JSON.stringify(value) === JSON.stringify(session.committed.value)) {
      session.baseRevision.value = revision;
      return;
    }
    if (dirty(session)) {
      session.lastError.value = Object.assign(
        new Error("配置已在其他位置更新，请刷新后继续编辑"),
        { code: "DRAFT_CONFLICT" }
      );
      clearTimer(session);
    } else open(value, revision, false, true);
  }
  const flush = () =>
    active.value ? submit(active.value) : Promise.resolve(true);
  const cancelPending = () => {
    if (active.value) clearTimer(active.value);
  };
  const discard = () => {
    const session = active.value;
    if (!session) return;
    clearTimer(session);
    session.discarded = true;
    sessions.delete(session.draft.value.id);
    active.value = undefined;
  };
  if (getCurrentScope())
    onScopeDispose(() => {
      for (const session of sessions.values()) {
        if (session.timer) void submit(session);
      }
    });
  return {
    draft,
    open,
    sync,
    flush,
    discard,
    cancelPending,
    isDirty,
    lastError,
    hasConflict,
    isSaving,
    editVersion,
    savedVersion,
    baseRevision,
    committedSnapshot,
  };
}
