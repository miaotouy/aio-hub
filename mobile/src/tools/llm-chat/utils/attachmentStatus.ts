import { getAssetDetail } from "../../asset-manager/services/assetService";
import type {
  AssetAvailability,
  ManagedAssetRef,
} from "../../asset-manager/types";

export type ChatAttachmentAvailability = AssetAvailability | "missing_record";

const CACHE_TTL_MS = 5_000;
const cache = new Map<
  string,
  { availability: ChatAttachmentAvailability; expiresAt: number }
>();
const pending = new Map<string, Promise<ChatAttachmentAvailability>>();

function availabilityFromError(error: unknown): ChatAttachmentAvailability {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  return message.includes("ASSET_NOT_FOUND") ? "missing_record" : "error";
}

export async function getAttachmentAvailability(
  assetId: string,
  options: { force?: boolean } = {}
): Promise<ChatAttachmentAvailability> {
  const cached = cache.get(assetId);
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    return cached.availability;
  }

  const running = pending.get(assetId);
  if (running) return running;

  const request = getAssetDetail(assetId)
    .then((detail) => detail.availability)
    .catch(availabilityFromError)
    .then((availability) => {
      cache.set(assetId, {
        availability,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      pending.delete(assetId);
      return availability;
    });
  pending.set(assetId, request);
  return request;
}

export async function getAttachmentAvailabilityMap(
  attachments: ManagedAssetRef[],
  options: { force?: boolean } = {}
): Promise<Map<string, ChatAttachmentAvailability>> {
  const assetIds = [
    ...new Set(attachments.map((attachment) => attachment.assetId)),
  ];
  const entries = await Promise.all(
    assetIds.map(
      async (assetId) =>
        [assetId, await getAttachmentAvailability(assetId, options)] as const
    )
  );
  return new Map(entries);
}

export function partitionAttachmentsByAvailability<T extends ManagedAssetRef>(
  attachments: T[],
  availability: Map<string, ChatAttachmentAvailability>
): { ready: T[]; unavailable: T[] } {
  const ready: T[] = [];
  const unavailable: T[] = [];
  for (const attachment of attachments) {
    (availability.get(attachment.assetId) === "ready"
      ? ready
      : unavailable
    ).push(attachment);
  }
  return { ready, unavailable };
}

export function invalidateAttachmentAvailability(assetId?: string): void {
  if (assetId) {
    cache.delete(assetId);
    return;
  }
  cache.clear();
}
