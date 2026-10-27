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
  readonly presentInPage: (target: FrameTarget, view: CardView) => Promise<boolean>;
  readonly presentInWindow: (view: CardView) => Promise<void>;
}

export async function handleLookupRequest(
  request: LookupRequest,
  deps: ControllerDeps,
): Promise<CardView> {
  const view = buildView(request.selection, request.scope);

  // Fire the API calls *now*, in parallel with injecting the UI. When the card
  // asks for the same lookups a moment later it joins these in-flight requests.
  if (view.kind === 'lookup') {
    for (const provider of view.providers) void deps.service.lookup(provider.id, view.indicator);
  }

  const shown = request.target !== undefined && (await deps.presentInPage(request.target, view));
  if (!shown) await deps.presentInWindow(view);
  return view;
}
