/** Orchestrates a user-initiated lookup: build the view, start the requests, show the card. */
import type { CardView } from '../core/messages';
import type { LookupService } from './lookup-service';
import type { FrameTarget } from './present';
import { buildView, type ProviderScope } from './view';

export interface LookupRequest {
  /** Undefined when the source has no tab (e.g. some browser UI surfaces). */
  readonly target: FrameTarget | undefined;
  readonly selection: string;
  readonly scope: ProviderScope;
}

export interface ControllerDeps {
  readonly service: Pick<LookupService, 'lookup'>;
  readonly presentInPage: (
    target: FrameTarget,
    view: CardView,
    corner: boolean,
  ) => Promise<boolean>;
  readonly presentInWindow: (view: CardView) => Promise<void>;
}

/**
 * Shows a view in the page (or the fallback window). Lookups start *now*, in
 * parallel with injecting the UI; when the card asks for them a moment later
 * it joins these in-flight requests.
 */
export async function presentView(
  view: CardView,
  target: FrameTarget | undefined,
  deps: ControllerDeps,
  corner = false,
): Promise<void> {
  if (view.kind === 'lookup') {
    for (const provider of view.providers) void deps.service.lookup(provider.id, view.indicator);
  }
  if (target !== undefined) {
    if (await deps.presentInPage(target, view, corner)) return;
    // An embedded frame from another site can't be scripted with activeTab; the
    // top page can, so show the card there (in the corner) before using a window.
    if (target.frameId !== 0 && (await deps.presentInPage({ ...target, frameId: 0 }, view, true))) {
      return;
    }
  }
  await deps.presentInWindow(view);
}

export async function handleLookupRequest(
  request: LookupRequest,
  deps: ControllerDeps,
): Promise<CardView> {
  const view = buildView(request.selection, request.scope);
  await presentView(view, request.target, deps);
  return view;
}
