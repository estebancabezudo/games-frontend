import {
  actorAnimationIsActive,
  advanceActorAnimation,
  createActorAnimationRuntime,
  currentActorAnimationAsset,
  selectActorAnimation,
} from "./actor-animation.js";
import { followControlledActorHorizontally } from "./actors-runtime.js";
import { resolveActorEffectiveVisual } from "./actor-visual-variants.js";
import {
  resolveActorVisual,
  resolveActorVisualState,
} from "./character-visual.js";
import { isSceneElementVisible } from "./element-visibility.js";
import { resolveSceneElementVariant } from "./element-variants.js";
import {
  actorRenderIndex,
  calculateCharacterScale,
  orderActorsByDepth,
} from "./scene-depth.js";
import {
  calculateViewportWorldWidth,
  createHorizontalCameraRuntime,
  updateHorizontalCameraViewport,
} from "./horizontal-camera.js";
import { screenPointToWorld } from "./scene-coordinates.js";
import { resolveSvgAssetUrl } from "./svg-asset.js";
import { walkSegmentIsEnabled } from "./walk-model.js";

const PREVIEW_INSET = 24;

export function createSceneRenderer(
  container,
  onHotspotPress,
  onScenePress,
  onActorPress = () => {},
) {
  const canvas = document.createElement("div");
  const elementsLayer = document.createElement("div");
  const walkLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const hotspotsLayer = document.createElement("div");
  const label = document.createElement("span");
  let sceneModel = null;
  let gameState = null;
  let actorsRuntime = {};
  let renderedElements = [];
  let elementNodes = [];
  let hotspotNodes = [];
  let actorNodes = new Map();
  let actorAnimationRuntimes = new Map();
  let actorAnimationFrameRequest = null;
  let actorAnimationTimestamp = null;
  let camera = null;

  canvas.className = "scene-canvas";
  elementsLayer.className = "scene-elements";
  walkLayer.classList.add("scene-walk");
  walkLayer.setAttribute("aria-label", "Walk paths (development)");
  hotspotsLayer.className = "scene-hotspots";
  label.className = "scene-label";
  canvas.append(elementsLayer, walkLayer, hotspotsLayer, label);
  canvas.addEventListener("click", (event) => {
    const bounds = canvas.getBoundingClientRect();
    handleScenePressEvent(
      event,
      sceneModel,
      camera,
      bounds,
      onScenePress,
    );
  });
  container.append(canvas);

  const resizeObserver = new ResizeObserver(() => updateSize());
  resizeObserver.observe(container);

  return {
    clear() {
      stopActorAnimationFrame();
      sceneModel = null;
      gameState = null;
      actorsRuntime = {};
      renderedElements = [];
      elementNodes = [];
      hotspotNodes = [];
      actorNodes = new Map();
      actorAnimationRuntimes = new Map();
      camera = null;
      canvas.hidden = true;
    },
    render(model, state, runtimeByActor = {}) {
      const resetScene = model !== sceneModel;
      if (resetScene) {
        stopActorAnimationFrame();
        actorAnimationRuntimes = new Map();
      }
      sceneModel = model;
      gameState = state;
      actorsRuntime = runtimeByActor;
      canvas.hidden = false;
      canvas.dataset.orientation = model.orientation;
      canvas.style.backgroundColor = model.backgroundColor;
      canvas.setAttribute(
        "aria-label",
        `Scene ${model.sceneId}, ${model.orientation}, ${model.size.width} × ${model.size.height}`,
      );
      label.textContent = `Scene: ${model.sceneId}`;
      updateSize(resetScene);
      renderWorldEntities();
      renderWalk();
      renderHotspots();
      positionWorldNodes();
    },
    updateActor(actorId, position, facing, motion) {
      const runtime = actorsRuntime[actorId];
      const node = actorNodes.get(actorId);
      if (runtime === undefined || node === undefined) {
        return;
      }
      runtime.position = position;
      runtime.facing = facing;
      runtime.motion = motion;
      if (actorId === sceneModel.controlledActorId) {
        followControlledActorHorizontally(
          camera,
          actorsRuntime,
          sceneModel.controlledActorId,
          actorId,
          sceneModel.size.width,
        );
        updateCameraDataset();
      }
      positionWorldNodes();
      updateActorVisual(sceneActor(actorId), node, runtime);
      orderWorldEntityNodes();
    },
  };

  function controlledRuntime() {
    return sceneModel.controlledActorId === null
      ? null
      : actorsRuntime[sceneModel.controlledActorId] ?? null;
  }

  function updateSize(resetCamera = false) {
    if (!sceneModel) return;
    const fitted = fitHorizontalViewportInPreview(sceneModel.size, {
      width: container.clientWidth,
      height: container.clientHeight,
    });
    const controlledPosition = controlledRuntime()?.position;
    if (resetCamera || camera === null) {
      camera = createHorizontalCameraRuntime(
        sceneModel.size,
        fitted.viewportWorldWidth,
        controlledPosition?.x ?? sceneModel.size.width / 2,
      );
    } else {
      updateHorizontalCameraViewport(
        camera,
        fitted.viewportWorldWidth,
        controlledPosition?.x ?? sceneModel.size.width / 2,
        sceneModel.size.width,
      );
    }
    canvas.style.width = `${fitted.width}px`;
    canvas.style.height = `${fitted.height}px`;
    canvas.style.left = `${fitted.left}px`;
    canvas.style.top = `${fitted.top}px`;
    updateCameraDataset();
    if (!resetCamera) positionWorldNodes();
  }

  function renderWorldEntities() {
    renderedElements = orderSceneElements(sceneModel.elements.map((element) => (
      resolveSceneElementVariant(element, gameState)
    )).filter((element) => isSceneElementVisible(element, gameState)));
    elementNodes = renderedElements.map((element) => {
      const node = document.createElement("div");
      node.className = "scene-element";
      node.dataset.elementId = element.id;
      renderElementVisual(node, element);
      return node;
    });

    actorNodes = new Map(sceneModel.actors.map((actor) => {
      const runtime = actorsRuntime[actor.id];
      return [actor.id, renderActor(actor, runtime)];
    }));
    orderWorldEntityNodes();
  }

  function orderWorldEntityNodes() {
    const groups = Array.from({ length: renderedElements.length + 1 }, () => []);
    orderActorsByDepth(sceneModel.actors, actorsRuntime).forEach(({ actor, runtime }) => {
      const index = actorRenderIndex(renderedElements, { ...actor, position: runtime.position });
      groups[index].push(actorNodes.get(actor.id));
    });
    const nodes = [];
    renderedElements.forEach((element, index) => {
      nodes.push(...groups[index], elementNodes[index]);
    });
    nodes.push(...groups[renderedElements.length]);
    elementsLayer.replaceChildren(...nodes);
  }

  function renderActor(actor, runtime) {
    const node = document.createElement("div");
    const image = document.createElement("img");
    let actorPressHandledByPointer = false;
    node.className = actor.id === sceneModel.controlledActorId
      ? "scene-actor scene-character scene-controlled-actor"
      : "scene-actor scene-character";
    node.dataset.actorId = actor.id;
    node.dataset.characterId = actor.id;
    node.dataset.interactive = String(
      actor.interactions !== null && actor.id !== sceneModel.controlledActorId,
    );
    node.addEventListener("pointerdown", (event) => {
      actorPressHandledByPointer = handleActorPointerDownEvent(
        event,
        actor,
        sceneModel.controlledActorId,
        onActorPress,
      );
    });
    node.addEventListener("pointerup", () => {
      setTimeout(() => {
        actorPressHandledByPointer = false;
      }, 0);
    });
    node.addEventListener("click", (event) => {
      if (actorPressHandledByPointer) {
        event.stopPropagation();
        actorPressHandledByPointer = false;
        return;
      }
      handleActorPressEvent(
        event,
        actor,
        sceneModel.controlledActorId,
        onActorPress,
      );
    });
    if (actor.interactions !== null && actor.id !== sceneModel.controlledActorId) {
      node.classList.add("scene-actor-interactive");
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-label", `Actor: ${actor.id}`);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActorPress(actor);
        }
      });
    }
    image.className = "scene-character-asset";
    image.alt = actor.id;
    image.draggable = false;
    image.addEventListener("error", () => {
      node.classList.add("scene-character-asset-error");
      node.textContent = `No se pudo cargar el asset del actor ${actor.id}: ${node.dataset.asset}`;
    });
    node.append(image);
    updateActorVisual(actor, node, runtime);
    updateActorNode(actor, runtime.position, node);
    return node;
  }

  function updateActorVisual(actor, node, runtime) {
    const effectiveVisual = resolveActorEffectiveVisual(actor, gameState);
    const visualState = resolveActorVisualState(
      effectiveVisual,
      runtime.motion,
      runtime.visualStateOverride,
    );
    const representation = resolveActorVisual(
      effectiveVisual,
      visualState,
      runtime.facing,
    );
    const animationRuntime = actorAnimationRuntime(actor.id);
    selectActorAnimation(
      animationRuntime,
      representation,
      visualState,
      runtime.facing,
      runtime.visualStateRevision,
    );
    node.dataset.facing = runtime.facing;
    node.dataset.motion = runtime.motion;
    node.dataset.visualState = visualState;
    node.dataset.visualStateOverride = runtime.visualStateOverride ?? "";
    node.dataset.visualStateRevision = String(runtime.visualStateRevision ?? 0);
    setActorAsset(node, animationRuntime, currentActorAnimationAsset(animationRuntime));
    updateActorAnimationFrame();
  }

  function actorAnimationRuntime(actorId) {
    if (!actorAnimationRuntimes.has(actorId)) {
      actorAnimationRuntimes.set(actorId, createActorAnimationRuntime());
    }
    return actorAnimationRuntimes.get(actorId);
  }

  function setActorAsset(node, animationRuntime, asset) {
    const image = node.querySelector("img");
    node.dataset.asset = asset;
    node.dataset.frameIndex = String(animationRuntime.frameIndex);
    if (image !== null && image.getAttribute("src") !== resolveSvgAssetUrl(asset, document.baseURI)) {
      image.src = resolveSvgAssetUrl(asset, document.baseURI);
    }
  }

  function updateActorAnimationFrame() {
    if (hasActiveActorAnimation()) {
      if (actorAnimationFrameRequest === null) {
        actorAnimationFrameRequest = requestAnimationFrame(advanceActorAnimations);
      }
    } else {
      stopActorAnimationFrame();
    }
  }

  function advanceActorAnimations(timestamp) {
    actorAnimationFrameRequest = null;
    if (actorAnimationTimestamp === null) {
      actorAnimationTimestamp = timestamp;
    } else {
      const elapsedSeconds = Math.max(0, timestamp - actorAnimationTimestamp) / 1000;
      actorAnimationTimestamp = timestamp;
      actorAnimationRuntimes.forEach((runtime, actorId) => {
        if (advanceActorAnimation(runtime, elapsedSeconds)) {
          const node = actorNodes.get(actorId);
          if (node !== undefined) {
            setActorAsset(node, runtime, currentActorAnimationAsset(runtime));
          }
        }
      });
    }
    if (hasActiveActorAnimation()) {
      actorAnimationFrameRequest = requestAnimationFrame(advanceActorAnimations);
    } else {
      actorAnimationTimestamp = null;
    }
  }

  function hasActiveActorAnimation() {
    return [...actorAnimationRuntimes.values()].some(actorAnimationIsActive);
  }

  function stopActorAnimationFrame() {
    if (actorAnimationFrameRequest !== null) {
      cancelAnimationFrame(actorAnimationFrameRequest);
    }
    actorAnimationFrameRequest = null;
    actorAnimationTimestamp = null;
  }

  function updateActorNode(actor, position, node) {
    const scale = calculateCharacterScale(position.y, sceneModel.depthScale);
    const rectangle = actorRectangleToPercent(
      { ...actor, position },
      { width: camera.viewportWorldWidth, height: sceneModel.size.height },
      scale,
      camera.x,
    );
    node.dataset.scale = String(scale);
    node.dataset.worldX = String(position.x);
    node.dataset.worldY = String(position.y);
    node.style.left = `${rectangle.left}%`;
    node.style.top = `${rectangle.top}%`;
    node.style.width = `${rectangle.width}%`;
    node.style.height = `${rectangle.height}%`;
  }

  function renderElementVisual(node, element) {
    if (element.color !== null) {
      node.textContent = element.id;
      node.style.backgroundColor = element.color;
      return;
    }
    const image = document.createElement("img");
    image.className = "scene-element-asset";
    image.alt = element.id;
    image.draggable = false;
    image.addEventListener("error", () => {
      node.classList.add("scene-element-asset-error");
      node.textContent = `No se pudo cargar el asset del elemento ${element.id}: ${element.asset}`;
    });
    image.src = resolveSvgAssetUrl(element.asset, document.baseURI);
    node.dataset.asset = element.asset;
    node.replaceChildren(image);
  }

  function renderHotspots() {
    hotspotNodes = sceneModel.hotspots.map((hotspot) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "scene-hotspot";
      node.textContent = hotspot.id;
      node.setAttribute("aria-label", `Hotspot: ${hotspot.id}`);
      node.addEventListener("click", (event) => {
        handleHotspotPressEvent(event, hotspot, onHotspotPress);
      });
      return node;
    });
    hotspotsLayer.replaceChildren(...hotspotNodes);
  }

  function renderWalk() {
    if (sceneModel.walk === null) {
      walkLayer.replaceChildren();
      return;
    }
    const segments = sceneModel.walk.segments.map((segment) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("scene-walk-segment");
      const state = walkSegmentOverlayState(segment, gameState);
      line.dataset.enabled = String(state === "enabled");
      if (state === "disabled") {
        line.classList.add("scene-walk-segment-disabled");
      }
      line.dataset.from = segment.from;
      line.dataset.to = segment.to;
      line.setAttribute("x1", String(segment.start.x));
      line.setAttribute("y1", String(segment.start.y));
      line.setAttribute("x2", String(segment.end.x));
      line.setAttribute("y2", String(segment.end.y));
      return line;
    });
    const nodes = sceneModel.walk.nodes.map((walkNode) => {
      const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      node.classList.add("scene-walk-node");
      node.dataset.walkNodeId = walkNode.id;
      node.setAttribute("cx", String(walkNode.x));
      node.setAttribute("cy", String(walkNode.y));
      node.setAttribute("r", "14");
      return node;
    });
    walkLayer.replaceChildren(...segments, ...nodes);
    updateWalkViewport();
  }

  function positionWorldNodes() {
    if (camera === null || sceneModel === null) return;
    updateWalkViewport();
    renderedElements.forEach((element, index) => positionRectangleNode(
      elementNodes[index],
      element,
    ));
    sceneModel.hotspots.forEach((hotspot, index) => positionRectangleNode(
      hotspotNodes[index],
      hotspot.area,
    ));
    sceneModel.actors.forEach((actor) => {
      const runtime = actorsRuntime[actor.id];
      const node = actorNodes.get(actor.id);
      if (runtime !== undefined && node !== undefined) {
        updateActorNode(actor, runtime.position, node);
      }
    });
  }

  function positionRectangleNode(node, rectangle) {
    if (node === undefined) return;
    const viewportRectangle = worldRectangleToViewportPercent(
      rectangle,
      sceneModel.size,
      camera,
    );
    node.style.left = `${viewportRectangle.left}%`;
    node.style.top = `${viewportRectangle.top}%`;
    node.style.width = `${viewportRectangle.width}%`;
    node.style.height = `${viewportRectangle.height}%`;
  }

  function updateCameraDataset() {
    canvas.dataset.cameraX = String(camera.x);
    canvas.dataset.viewportWorldWidth = String(camera.viewportWorldWidth);
  }

  function updateWalkViewport() {
    walkLayer.setAttribute(
      "viewBox",
      `${camera.x} 0 ${camera.viewportWorldWidth} ${sceneModel.size.height}`,
    );
  }

  function sceneActor(actorId) {
    return sceneModel.actors.find((actor) => actor.id === actorId);
  }
}

export function walkSegmentOverlayState(segment, gameState) {
  return walkSegmentIsEnabled(segment, gameState) ? "enabled" : "disabled";
}

export function handleScenePressEvent(
  event,
  sceneModel,
  camera,
  canvasBounds,
  onScenePress,
) {
  if (sceneModel?.controlledActorId === null) {
    return false;
  }
  const destination = screenPointToWorld(
    { x: event.clientX, y: event.clientY },
    {
      left: canvasBounds.left,
      top: canvasBounds.top,
      width: canvasBounds.width,
      height: canvasBounds.height,
    },
    {
      width: camera.viewportWorldWidth,
      height: sceneModel.size.height,
    },
    camera.x,
    sceneModel.size,
  );
  onScenePress(destination);
  return true;
}

export function handleActorPressEvent(
  event,
  actor,
  controlledActorId,
  onActorPress,
) {
  if (actor.interactions === null || actor.id === controlledActorId) {
    return false;
  }
  event.stopPropagation();
  onActorPress(actor);
  return true;
}

export function captureInteractiveActorPointer(event, actor, controlledActorId) {
  if (actor.interactions === null || actor.id === controlledActorId) {
    return false;
  }
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  return true;
}

export function handleActorPointerDownEvent(
  event,
  actor,
  controlledActorId,
  onActorPress,
) {
  if (!captureInteractiveActorPointer(event, actor, controlledActorId)) {
    return false;
  }
  return handleActorPressEvent(event, actor, controlledActorId, onActorPress);
}

export function handleHotspotPressEvent(event, hotspot, onHotspotPress) {
  event.stopPropagation();
  onHotspotPress(hotspot);
  return true;
}

export function fitSceneInPreview(sceneSize, previewSize) {
  const availableWidth = Math.max(0, previewSize.width - PREVIEW_INSET * 2);
  const availableHeight = Math.max(0, previewSize.height - PREVIEW_INSET * 2);
  const scale = Math.min(
    availableWidth / sceneSize.width,
    availableHeight / sceneSize.height,
  );
  const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 0;
  const width = sceneSize.width * safeScale;
  const height = sceneSize.height * safeScale;
  return {
    width,
    height,
    left: (previewSize.width - width) / 2,
    top: (previewSize.height - height) / 2,
  };
}

export function fitHorizontalViewportInPreview(sceneSize, previewSize) {
  const availableWidth = Math.max(0, previewSize.width - PREVIEW_INSET * 2);
  const availableHeight = Math.max(0, previewSize.height - PREVIEW_INSET * 2);
  const viewportWorldWidth = calculateViewportWorldWidth(
    sceneSize,
    { width: availableWidth, height: availableHeight },
  );
  const scale = availableHeight / sceneSize.height;
  const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 0;
  const width = viewportWorldWidth * safeScale;
  const height = sceneSize.height * safeScale;
  return {
    width,
    height,
    left: (previewSize.width - width) / 2,
    top: (previewSize.height - height) / 2,
    viewportWorldWidth,
  };
}

export function worldRectangleToPercent(element, sceneSize) {
  return {
    left: element.x / sceneSize.width * 100,
    top: element.y / sceneSize.height * 100,
    width: element.width / sceneSize.width * 100,
    height: element.height / sceneSize.height * 100,
  };
}

export function orderSceneElements(elements) {
  return [...elements].sort((left, right) => left.z - right.z);
}

export function actorRectangleToPercent(actor, sceneSize, scale, cameraX = 0) {
  const width = actor.size.width * scale;
  const height = actor.size.height * scale;
  return {
    left: (actor.position.x - cameraX - width / 2) / sceneSize.width * 100,
    top: (actor.position.y - height) / sceneSize.height * 100,
    width: width / sceneSize.width * 100,
    height: height / sceneSize.height * 100,
  };
}

export function characterRectangleToPercent(character, sceneSize, scale, cameraX = 0) {
  return actorRectangleToPercent(character, sceneSize, scale, cameraX);
}

export function worldRectangleToViewportPercent(rectangle, sceneSize, camera) {
  return {
    left: (rectangle.x - camera.x) / camera.viewportWorldWidth * 100,
    top: rectangle.y / sceneSize.height * 100,
    width: rectangle.width / camera.viewportWorldWidth * 100,
    height: rectangle.height / sceneSize.height * 100,
  };
}
