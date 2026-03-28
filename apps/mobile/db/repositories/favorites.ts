import { and, eq } from "drizzle-orm";
import { favorites, getDb } from "../index";
import type { RemoteFavorite } from "../../types";

export type FavoriteEntityType = "video" | "custom_playlist" | "channel_playlist";
export type FavoritePendingAction = "add" | "remove";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getFavoriteRow(
  entityType: FavoriteEntityType,
  entityId: string
) {
  return getDb()
    .select()
    .from(favorites)
    .where(
      and(
        eq(favorites.entityType, entityType),
        eq(favorites.entityId, entityId)
      )
    )
    .get();
}

function toRemoteFavorite(
  favorite: typeof favorites.$inferSelect
): RemoteFavorite {
  return {
    id: favorite.id,
    entityType: favorite.entityType as FavoriteEntityType,
    entityId: favorite.entityId,
  };
}

function getAllFavoriteRows() {
  return getDb().select().from(favorites).all();
}

export function getFavoritesSnapshotLocal(): {
  favorites: RemoteFavorite[];
  favoritePlaylistIds: Set<string>;
} {
  const activeFavorites = getAllFavoriteRows().filter((favorite) => favorite.isFavorite);
  const favoritePlaylistIds = new Set<string>();

  for (const favorite of activeFavorites) {
    if (
      favorite.entityType === "channel_playlist" ||
      favorite.entityType === "custom_playlist"
    ) {
      favoritePlaylistIds.add(favorite.entityId);
    }
  }

  return {
    favorites: activeFavorites.map(toRemoteFavorite),
    favoritePlaylistIds,
  };
}

export function hasPendingFavoriteActionsLocal(): boolean {
  return getAllFavoriteRows().some((favorite) => Boolean(favorite.pendingAction));
}

export function getPendingFavoriteActionsLocal(): Array<
  typeof favorites.$inferSelect
> {
  return getAllFavoriteRows()
    .filter(
      (favorite): favorite is typeof favorites.$inferSelect & {
        pendingAction: FavoritePendingAction;
      } =>
        favorite.pendingAction === "add" || favorite.pendingAction === "remove"
    )
    .sort((a, b) => (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt));
}

export function addFavoriteLocal(
  entityType: FavoriteEntityType,
  entityId: string
): void {
  const existing = getFavoriteRow(entityType, entityId);
  const now = Date.now();

  if (!existing) {
    getDb()
      .insert(favorites)
      .values({
        id: generateId(),
        entityType,
        entityId,
        isFavorite: true,
        pendingAction: "add",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return;
  }

  if (existing.isFavorite && existing.pendingAction !== "remove") {
    return;
  }

  const pendingAction =
    existing.pendingAction === "remove" ? null : ("add" as FavoritePendingAction);

  getDb()
    .update(favorites)
    .set({
      isFavorite: true,
      pendingAction,
      updatedAt: now,
    })
    .where(eq(favorites.id, existing.id))
    .run();
}

export function removeFavoriteLocal(
  entityType: FavoriteEntityType,
  entityId: string
): void {
  const existing = getFavoriteRow(entityType, entityId);
  if (!existing) {
    return;
  }

  if (existing.pendingAction === "add") {
    getDb().delete(favorites).where(eq(favorites.id, existing.id)).run();
    return;
  }

  if (!existing.isFavorite && existing.pendingAction === "remove") {
    return;
  }

  getDb()
    .update(favorites)
    .set({
      isFavorite: false,
      pendingAction: "remove",
      updatedAt: Date.now(),
    })
    .where(eq(favorites.id, existing.id))
    .run();
}

export function resolveFavoriteSyncLocal(
  entityType: FavoriteEntityType,
  entityId: string,
  isFavorite: boolean
): void {
  const existing = getFavoriteRow(entityType, entityId);
  if (!existing) {
    return;
  }

  if (isFavorite) {
    getDb()
      .update(favorites)
      .set({
        isFavorite: true,
        pendingAction: null,
        updatedAt: Date.now(),
      })
      .where(eq(favorites.id, existing.id))
      .run();
    return;
  }

  getDb().delete(favorites).where(eq(favorites.id, existing.id)).run();
}

export function mergeRemoteFavorites(remoteFavorites: RemoteFavorite[]): void {
  const remoteKeys = new Set(
    remoteFavorites.map((favorite) => `${favorite.entityType}:${favorite.entityId}`)
  );
  const localRows = getAllFavoriteRows();
  const now = Date.now();

  for (const remoteFavorite of remoteFavorites) {
    const existing = getFavoriteRow(
      remoteFavorite.entityType as FavoriteEntityType,
      remoteFavorite.entityId
    );

    if (!existing) {
      getDb()
        .insert(favorites)
        .values({
          id: remoteFavorite.id,
          entityType: remoteFavorite.entityType,
          entityId: remoteFavorite.entityId,
          isFavorite: true,
          pendingAction: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      continue;
    }

    if (existing.pendingAction === "remove") {
      continue;
    }

    getDb()
      .update(favorites)
      .set({
        isFavorite: true,
        pendingAction: null,
        updatedAt: now,
      })
      .where(eq(favorites.id, existing.id))
      .run();
  }

  for (const localFavorite of localRows) {
    const key = `${localFavorite.entityType}:${localFavorite.entityId}`;

    if (localFavorite.pendingAction === "add" && remoteKeys.has(key)) {
      resolveFavoriteSyncLocal(
        localFavorite.entityType as FavoriteEntityType,
        localFavorite.entityId,
        true
      );
      continue;
    }

    if (localFavorite.pendingAction === "remove" && !remoteKeys.has(key)) {
      resolveFavoriteSyncLocal(
        localFavorite.entityType as FavoriteEntityType,
        localFavorite.entityId,
        false
      );
      continue;
    }

    if (!localFavorite.pendingAction && !remoteKeys.has(key)) {
      getDb().delete(favorites).where(eq(favorites.id, localFavorite.id)).run();
    }
  }
}
