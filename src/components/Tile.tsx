import { useRef, useState } from "react";
import { Folder, Pin, X } from "lucide-react";
import { isGroup, type GroupNode } from "../api/types";
import { groupCounts, metricOf, type Status } from "../board/model";
import type { PositionedTile } from "../board/layout";
import { Icon } from "./Icon";

const LONG_PRESS_MS = 500;

interface TileProps {
  tile: PositionedTile;
  status: Status;
  fill: string;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  pinLabel?: "Pin" | "Unpin";
  disabledPaths?: Set<string>;
  onActivate?: () => void;
  onLongPress?: () => void;
  register: (el: HTMLElement | null) => void;
}

export function Tile({
  tile,
  status,
  fill,
  selected,
  label,
  onActivate,
  onLongPress,
  register,
  pinLabel,
  disabled,
  disabledPaths,
}: TileProps) {
  const big = tile.size === 2;
  const [pressed, setPressed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const longed = useRef(false);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = undefined;
    setPressed(false);
  };

  const onPointerDown = () => {
    if (!onLongPress) return;
    longed.current = false;
    setPressed(true);
    timer.current = window.setTimeout(() => {
      longed.current = true;
      setPressed(false);
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (longed.current) {
      longed.current = false;
      return;
    }
    onActivate?.();
  };

  return (
    <button
      type="button"
      ref={register}
      data-key={tile.key}
      className={`tile${big ? " big" : ""}${pressed ? " pressing" : ""}${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}
      style={{
        left: tile.rect.left,
        top: tile.rect.top,
        width: tile.rect.width,
        height: tile.rect.height,
        background: fill,
      }}
      title={label}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleClick}
    >
      <TileBody
        tile={tile}
        status={status}
        big={big}
        pinLabel={pinLabel}
        disabled={disabled}
        disabledPaths={disabledPaths}
      />
    </button>
  );
}

function TileBody({
  tile,
  status,
  big,
  pinLabel,
  disabled,
  disabledPaths,
}: {
  tile: PositionedTile;
  status: Status;
  big: boolean;
  pinLabel?: "Pin" | "Unpin";
  disabled?: boolean;
  disabledPaths?: Set<string>;
}) {
  const { item } = tile;
  const node = item.node;
  const iconSize = big ? 28 : 20;

  if (item.kind === "pin") {
    return (
      <>
        <div className="top">
          <Pin size={16} aria-hidden />
        </div>
        <div>
          <div className="gn">{pinLabel ?? "Pin"}</div>
          <div className="gs">{node.name}</div>
        </div>
      </>
    );
  }

  if (item.kind === "closer") {
    const { total, failing } = groupCounts(node as GroupNode, disabledPaths);
    const metricValue = failing > 0 ? String(failing) : String(total);
    const metricUnit = failing > 0 ? `of ${total} failing` : "all ok";
    return (
      <>
        <div className="top">
          <Icon name={node.display?.icon} size={iconSize} />
          <X size={13} aria-hidden />
        </div>
        <div>
          <div className="nm">{node.name}</div>
          <div className="met">
            {metricValue}
            <span className="u"> {metricUnit}</span>
          </div>
        </div>
      </>
    );
  }

  if (isGroup(node)) {
    const { total, failing } = groupCounts(node, disabledPaths);
    const metricValue = failing > 0 ? String(failing) : String(total);
    const metricUnit = failing > 0 ? `of ${total} failing` : "all ok";
    return (
      <>
        <div className="top">
          <Icon name={node.display?.icon} size={iconSize} />
          <Folder size={14} aria-hidden />
        </div>
        <div>
          <div className="nm">{node.name}</div>
          <div className="met">
            {metricValue}
            <span className="u"> {metricUnit}</span>
          </div>
        </div>
      </>
    );
  }

  // entity
  const isDisabled = Boolean(disabled);
  if (isDisabled) {
    return (
      <>
        <div className="top">
          <Icon name={node.display?.icon} size={iconSize} />
        </div>
        <div>
          <div className="nm">{node.name}</div>
          <div className="met">Disabled</div>
        </div>
      </>
    );
  }

  let value: string;
  let unit = "";
  if (status === "warn") {
    value = "Slow";
  } else if (status === "crit") {
    value = "Down";
  } else {
    const metric = metricOf(node);
    if (metric) {
      value = metric.value;
      unit = metric.unit;
    } else {
      value = status === "unknown" ? "-" : "ok";
    }
  }

  return (
    <>
      <div className="top">
        <Icon name={node.display?.icon} size={iconSize} />
      </div>
      <div>
        <div className="nm">{node.name}</div>
        <div className="met">
          {value}
          {unit && <span className="u"> {unit}</span>}
        </div>
      </div>
    </>
  );
}
