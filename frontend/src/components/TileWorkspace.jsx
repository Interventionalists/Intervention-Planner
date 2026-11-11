import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { apiFetch } from "../api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const SAVE_DELAY_MS = 600;

function defaultLayout(tiles) {
  return {
    order: tiles
      .filter((tile) => tile.defaultVisible !== false)
      .map((tile) => tile.id),
    catalogIds: tiles.map((tile) => tile.id),
    sizes: {},
  };
}

//turns a saved layout (from the server or the local cache) into one that only
//references tiles that exist now, and shows any tiles added since it was saved.
function normalizeLayout(parsedLayout, tiles) {
  const tileIds = tiles.map((tile) => tile.id);
  if (!parsedLayout || !Array.isArray(parsedLayout.order)) {
    throw new Error("Saved tile layout has an invalid order.");
  }

  const catalogIds = Array.isArray(parsedLayout.catalogIds)
    ? parsedLayout.catalogIds
    : parsedLayout.order;
  const order = parsedLayout.order.filter(
    (id, index) => tileIds.includes(id) && parsedLayout.order.indexOf(id) === index
  );
  const newTileIds = tiles
    .filter(
      (tile) => !catalogIds.includes(tile.id) && tile.defaultVisible !== false
    )
    .map((tile) => tile.id);
  const sizes =
    parsedLayout.sizes && typeof parsedLayout.sizes === "object"
      ? parsedLayout.sizes
      : {};

  return {
    order: [...order, ...newTileIds],
    catalogIds: tileIds,
    sizes,
  };
}

function readCachedLayout(storageKey) {
  try {
    const savedLayout = localStorage.getItem(storageKey);
    return savedLayout ? JSON.parse(savedLayout) : null;
  } catch {
    return null;
  }
}

function createInitialLayout(storageKey, tiles) {
  const cachedLayout = readCachedLayout(storageKey);
  if (!cachedLayout) {
    return defaultLayout(tiles);
  }
  try {
    return normalizeLayout(cachedLayout, tiles);
  } catch (error) {
    console.error("Could not load the saved tile layout:", error);
    return defaultLayout(tiles);
  }
}

function saveLayoutToServer(pageKey, layout, options = {}) {
  return apiFetch(`${API_BASE_URL}/layouts/${encodeURIComponent(pageKey)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout }),
    ...options,
  });
}

//pageKey identifies the page in the user_layouts table (one row per user per
//page). storageKey is a local cache so the page renders instantly and still
//works if the backend can't be reached.
function TileWorkspace({
  className,
  pageKey,
  storageKey,
  tiles,
  gridSizing = false,
}) {
  const [layout, setLayout] = useState(() =>
    createInitialLayout(storageKey, tiles)
  );
  //no server writes until the server copy has been loaded, so a stale local
  //cache can't overwrite a layout saved from another device.
  const [hasLoadedServerLayout, setHasLoadedServerLayout] = useState(!pageKey);
  const lastSavedLayout = useRef(null);
  const pendingSave = useRef(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [draggedTileId, setDraggedTileId] = useState(null);
  const tileIds = tiles.map((tile) => tile.id);

  useEffect(() => {
    setLayout((currentLayout) => {
      const newTileIds = tiles
        .filter(
          (tile) =>
            !currentLayout.catalogIds.includes(tile.id) &&
            tile.defaultVisible !== false
        )
        .map((tile) => tile.id);
      return {
        ...currentLayout,
        order: [
          ...currentLayout.order.filter((id) => tileIds.includes(id)),
          ...newTileIds,
        ],
        catalogIds: tileIds,
      };
    });
  }, [storageKey, tileIds.join("|")]);

  useEffect(() => {
    if (!pageKey) {
      return undefined;
    }
    const controller = new AbortController();
    setHasLoadedServerLayout(false);

    apiFetch(`${API_BASE_URL}/layouts/${encodeURIComponent(pageKey)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Layout request failed (${response.status}).`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.layout) {
          const serverLayout = normalizeLayout(data.layout, tiles);
          lastSavedLayout.current = JSON.stringify(data.layout);
          setLayout(serverLayout);
        }
        //no server copy yet: the current (possibly cached) layout gets
        //uploaded by the save effect below, migrating old local layouts.
        setHasLoadedServerLayout(true);
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          return;
        }
        //keep using the local layout; changes stay cached locally and the
        //server will be tried again next time the page opens.
        console.error("Could not load the saved tile layout:", error);
      });

    return () => controller.abort();
    // tiles is read once per page load; tile changes are merged by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch (error) {
      console.error("Could not cache the tile layout:", error);
    }

    if (!pageKey || !hasLoadedServerLayout) {
      return undefined;
    }
    const serializedLayout = JSON.stringify(layout);
    if (serializedLayout === lastSavedLayout.current) {
      return undefined;
    }

    const timer = setTimeout(() => {
      pendingSave.current = null;
      saveLayoutToServer(pageKey, layout)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Layout save failed (${response.status}).`);
          }
          lastSavedLayout.current = serializedLayout;
        })
        .catch((error) => {
          console.error("Could not save the tile layout:", error);
        });
    }, SAVE_DELAY_MS);
    pendingSave.current = { pageKey, layout };

    return () => clearTimeout(timer);
  }, [layout, storageKey, pageKey, hasLoadedServerLayout]);

  //if the user leaves the page inside the debounce window, send the last
  //change anyway; keepalive lets the request finish after unmount.
  useEffect(
    () => () => {
      if (pendingSave.current) {
        const { pageKey: key, layout: unsavedLayout } = pendingSave.current;
        saveLayoutToServer(key, unsavedLayout, { keepalive: true }).catch(
          () => {}
        );
      }
    },
    []
  );

  const visibleTiles = layout.order
    .map((id) => tiles.find((tile) => tile.id === id))
    .filter(Boolean);
  const availableTiles = tiles.filter(
    (tile) => !layout.order.includes(tile.id)
  );

  const moveTile = (tileId, direction) => {
    setLayout((currentLayout) => {
      const currentIndex = currentLayout.order.indexOf(tileId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentLayout.order.length) {
        return currentLayout;
      }

      const order = [...currentLayout.order];
      [order[currentIndex], order[nextIndex]] = [
        order[nextIndex],
        order[currentIndex],
      ];
      return { ...currentLayout, order };
    });
    setOpenMenuId(null);
  };

  const removeTile = (tileId) => {
    setLayout((currentLayout) => ({
      ...currentLayout,
      order: currentLayout.order.filter((id) => id !== tileId),
    }));
    setOpenMenuId(null);
  };

  const addTile = (tileId) => {
    setLayout((currentLayout) => ({
      ...currentLayout,
      order: [...currentLayout.order, tileId],
    }));
    setIsAddMenuOpen(false);
  };

  const saveTileSize = (event, tileId) => {
    const tile = event.currentTarget;
    if (gridSizing) {
      const maxWidth = tile.parentElement.clientWidth;
      const minWidth = Math.min(220, maxWidth);
      const snap = (value, min, max) =>
        Math.min(max, Math.max(min, min + Math.round((value - min) / 50) * 50));
      const width = snap(tile.offsetWidth, minWidth, maxWidth);
      const height = Math.max(
        180,
        180 + Math.round((tile.offsetHeight - 180) / 50) * 50
      );
      setLayout((current) => ({
        ...current,
        sizes:
          current.sizes[tileId]?.width === width &&
          current.sizes[tileId]?.height === height
            ? current.sizes
            : { ...current.sizes, [tileId]: { width, height } },
      }));
      return;
    }

    const { offsetWidth: width, offsetHeight: height } = tile;
    setLayout((currentLayout) => ({
      ...currentLayout,
      sizes:
        currentLayout.sizes[tileId]?.width === width &&
        currentLayout.sizes[tileId]?.height === height
          ? currentLayout.sizes
          : { ...currentLayout.sizes, [tileId]: { width, height } },
    }));
  };

  const reorderTile = (sourceId, targetId) => {
    setLayout((currentLayout) => {
      const order = [...currentLayout.order];
      const sourceIndex = order.indexOf(sourceId);
      const targetIndex = order.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return currentLayout;
      }

      order.splice(sourceIndex, 1);
      order.splice(order.indexOf(targetId), 0, sourceId);
      return { ...currentLayout, order };
    });
  };

  return (
    <>
      <section
        className={className}
        onDragOver={
          gridSizing ? (event) => event.preventDefault() : undefined
        }
        onDrop={
          gridSizing
            ? (event) => {
                event.preventDefault();
                if (!draggedTileId) return;
                const nearest = [
                  ...event.currentTarget.querySelectorAll(".managed-tile"),
                ]
                  .filter((tile) => tile.dataset.tileId !== draggedTileId)
                  .map((tile) => {
                    const bounds = tile.getBoundingClientRect();
                    return {
                      id: tile.dataset.tileId,
                      distance: Math.hypot(
                        event.clientX - (bounds.left + bounds.width / 2),
                        event.clientY - (bounds.top + bounds.height / 2)
                      ),
                    };
                  })
                  .sort((a, b) => a.distance - b.distance)[0];
                if (nearest) reorderTile(draggedTileId, nearest.id);
                setDraggedTileId(null);
              }
            : undefined
        }
      >
        {visibleTiles.map((tile, index) => {
          const size = layout.sizes[tile.id];
          return (
            <div
              className="managed-tile"
              data-tile-id={tile.id}
              key={tile.id}
              onPointerUp={(event) => saveTileSize(event, tile.id)}
              style={{
                width: size?.width ? `${size.width}px` : undefined,
                height: size?.height ? `${size.height}px` : undefined,
              }}
            >
              <div className="tile-control-row">
                {gridSizing && (
                  <button
                    aria-label={`Drag to move ${tile.title}`}
                    className="tile-drag-handle"
                    draggable
                    onDragStart={(event) => {
                      setDraggedTileId(tile.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", tile.id);
                      const tileElement =
                        event.currentTarget.closest(".managed-tile");
                      const bounds = tileElement.getBoundingClientRect();
                      const ghost = tileElement.cloneNode(true);
                      Object.assign(ghost.style, {
                        position: "fixed",
                        top: "0",
                        left: "-10000px",
                        width: `${bounds.width}px`,
                        height: `${bounds.height}px`,
                        opacity: "0.55",
                        pointerEvents: "none",
                      });
                      document.body.appendChild(ghost);
                      event.dataTransfer.setDragImage(
                        ghost,
                        event.clientX - bounds.left,
                        event.clientY - bounds.top
                      );
                      requestAnimationFrame(() => ghost.remove());
                    }}
                    onDragEnd={() => setDraggedTileId(null)}
                    title="Drag to move"
                    type="button"
                  />
                )}
                <button
                  aria-label={`Options for ${tile.title}`}
                  aria-expanded={openMenuId === tile.id}
                  className="tile-menu-toggle"
                  onClick={() =>
                    setOpenMenuId((currentId) =>
                      currentId === tile.id ? null : tile.id
                    )
                  }
                  type="button"
                >
                  <MoreHorizontal size={19} />
                </button>
                {openMenuId === tile.id && (
                  <div className="tile-menu">
                    <button
                      disabled={index === 0}
                      onClick={() => moveTile(tile.id, -1)}
                      type="button"
                    >
                      <ArrowUp size={15} />
                      Move up
                    </button>
                    <button
                      disabled={index === visibleTiles.length - 1}
                      onClick={() => moveTile(tile.id, 1)}
                      type="button"
                    >
                      <ArrowDown size={15} />
                      Move down
                    </button>
                    <button
                      className="tile-delete-action"
                      onClick={() => removeTile(tile.id)}
                      type="button"
                    >
                      <Trash2 size={15} />
                      Delete tile
                    </button>
                  </div>
                )}
              </div>
              {tile.content}
            </div>
          );
        })}
      </section>
      <div className="tile-add-control">
        {isAddMenuOpen && (
          <div aria-label="Add a tile" className="tile-add-menu">
            {availableTiles.length ? (
              availableTiles.map((tile) => (
                <button
                  key={tile.id}
                  onClick={() => addTile(tile.id)}
                  type="button"
                >
                  {tile.title}
                </button>
              ))
            ) : (
              <p>All available tiles are on this page.</p>
            )}
          </div>
        )}
        <button
          aria-expanded={isAddMenuOpen}
          aria-label={isAddMenuOpen ? "Close add tile menu" : "Add a tile"}
          className="tile-add-button"
          onClick={() => setIsAddMenuOpen((isOpen) => !isOpen)}
          type="button"
        >
          <Plus size={24} />
        </button>
      </div>
    </>
  );
}

export default TileWorkspace;
