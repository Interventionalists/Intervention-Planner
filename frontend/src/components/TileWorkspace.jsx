import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Trash2 } from "lucide-react";

function createInitialLayout(storageKey, tiles) {
  const tileIds = tiles.map((tile) => tile.id);

  try {
    const savedLayout = localStorage.getItem(storageKey);
    if (!savedLayout) {
      return { order: tileIds, catalogIds: tileIds, sizes: {} };
    }

    const parsedLayout = JSON.parse(savedLayout);
    if (!Array.isArray(parsedLayout.order)) {
      throw new Error("Saved tile layout has an invalid order.");
    }

    const catalogIds = Array.isArray(parsedLayout.catalogIds)
      ? parsedLayout.catalogIds
      : parsedLayout.order;
    const order = parsedLayout.order.filter(
      (id, index) => tileIds.includes(id) && parsedLayout.order.indexOf(id) === index
    );
    const newTileIds = tileIds.filter((id) => !catalogIds.includes(id));
    const sizes =
      parsedLayout.sizes && typeof parsedLayout.sizes === "object"
        ? parsedLayout.sizes
        : {};

    return {
      order: [...order, ...newTileIds],
      catalogIds: tileIds,
      sizes,
    };
  } catch (error) {
    console.error("Could not load the saved tile layout:", error);
    return { order: tileIds, catalogIds: tileIds, sizes: {} };
  }
}

function TileWorkspace({ className, storageKey, tiles }) {
  const [layout, setLayout] = useState(() =>
    createInitialLayout(storageKey, tiles)
  );
  const [openMenuId, setOpenMenuId] = useState(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const tileIds = tiles.map((tile) => tile.id);

  useEffect(() => {
    setLayout((currentLayout) => {
      const newTileIds = tileIds.filter(
        (id) => !currentLayout.catalogIds.includes(id)
      );
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
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch (error) {
      console.error("Could not save the tile layout:", error);
    }
  }, [layout, storageKey]);

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
    if (event.target !== event.currentTarget) {
      return;
    }
    const { offsetWidth: width, offsetHeight: height } = event.currentTarget;
    setLayout((currentLayout) => ({
      ...currentLayout,
      sizes: { ...currentLayout.sizes, [tileId]: { width, height } },
    }));
  };

  return (
    <>
      <section className={className}>
        {visibleTiles.map((tile, index) => {
          const size = layout.sizes[tile.id];
          return (
            <div
              className="managed-tile"
              key={tile.id}
              onPointerUp={(event) => saveTileSize(event, tile.id)}
              style={{
                width: size?.width ? `${size.width}px` : undefined,
                height: size?.height ? `${size.height}px` : undefined,
              }}
            >
              <div className="tile-control-row">
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
